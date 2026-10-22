"""Step 1: join findings to the assets. Problems are reported, not fatal."""

from collections import defaultdict
from dataclasses import dataclass, field

from app.models.inputs import Case, Equipment, Finding, parse_findings


@dataclass
class FindingsCheck:
    filename: str
    findings: list[Finding] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)
    unknown_equipment: list[dict] = field(default_factory=list)
    type_mismatches: list[dict] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return bool(self.findings) and not (self.problems or self.unknown_equipment)

    def summary(self) -> dict:
        return {
            "filename": self.filename,
            "rows": len(self.findings),
            "problems": self.problems,
            "unknown_equipment": self.unknown_equipment,
            "type_mismatches": self.type_mismatches,
            "ok": self.ok,
        }


def check_findings(equipments: list[Equipment], text: str, filename: str) -> FindingsCheck:
    parsed = parse_findings(text)
    out = FindingsCheck(filename, parsed.rows, parsed.problems)
    if not parsed.rows and not parsed.problems:
        out.problems.append("the file has a header but no rows")
    registry = {e.equipment_id: e for e in equipments}
    for f in parsed.rows:
        eq = registry.get(f.equipment_id)
        if eq is None:
            out.unknown_equipment.append({"finding_id": f.finding_id, "equipment_id": f.equipment_id})
        elif eq.equipment_type != f.equipment_type:
            out.type_mismatches.append({
                "finding_id": f.finding_id, "equipment_id": f.equipment_id,
                "finding_type": f.equipment_type, "asset_type": eq.equipment_type,
            })
    return out


def build_cases(
        equipments: list[Equipment],
        findings: list[Finding],
) -> tuple[dict[str, Equipment], dict[str, list[Finding]], list[Case]]:
    registry = {e.equipment_id: e for e in equipments}
    findings_by_equipment: dict[str, list[Finding]] = defaultdict(list)
    cases: list[Case] = []
    for finding in findings:
        eq = registry.get(finding.equipment_id)
        if eq is None:
            raise ValueError(f"finding {finding.finding_id} references unknown equipment {finding.equipment_id}")
        findings_by_equipment[finding.equipment_id].append(finding)
        cases.append(Case(finding=finding, equipment=eq))
    return registry, dict(findings_by_equipment), cases
