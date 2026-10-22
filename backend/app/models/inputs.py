"""Input rows and the unit of work. Parsing collects problems instead of raising."""

import csv
import io
from dataclasses import asdict, dataclass, field
from datetime import date
from enum import Enum

REGISTRY_COLUMNS = [
    "equipment_id", "equipment_type", "service_description", "criticality_score",
    "reliability_score", "safety_critical_element", "redundancy", "engineer_comment",
]
FINDINGS_COLUMNS = [
    "finding_id", "reported_date", "equipment_id", "equipment_type", "inspection_type",
    "inspection_method", "finding_description", "reported_by", "reporter_role",
]


class NoteKind(Enum):
    SIBLING = "sibling"
    PARTNER_HAS_FINDING = "partner_has_finding"
    PARTNER_UNVERIFIED = "partner_unverified"
    VOTED_GROUP = "voted_group"
    REDUNDANCY_UNCLASSIFIED = "redundancy_unclassified"


@dataclass(frozen=True)
class Note:
    kind: NoteKind
    text: str


@dataclass(frozen=True)
class Equipment:
    equipment_id: str
    equipment_type: str
    service_description: str
    criticality_score: int
    reliability_score: int
    safety_critical_element: bool
    redundancy: str
    engineer_comment: str

    @classmethod
    def from_row(cls, row: dict) -> "Equipment":
        return cls(
            equipment_id=row["equipment_id"].strip(),
            equipment_type=row["equipment_type"].strip(),
            service_description=row["service_description"].strip(),
            criticality_score=score(row["criticality_score"], "criticality_score"),
            reliability_score=score(row["reliability_score"], "reliability_score"),
            safety_critical_element=row["safety_critical_element"].strip().lower() == "yes",
            redundancy=row["redundancy"].strip(),
            engineer_comment=row["engineer_comment"].strip(),
        )

    @classmethod
    def from_record(cls, r: dict) -> "Equipment":
        return cls(
            equipment_id=r["equipment_id"], equipment_type=r["equipment_type"],
            service_description=r["service_description"], criticality_score=int(r["criticality_score"]),
            reliability_score=int(r["reliability_score"]), safety_critical_element=bool(r["safety_critical_element"]),
            redundancy=r["redundancy"], engineer_comment=r["engineer_comment"],
        )


@dataclass(frozen=True)
class Finding:
    finding_id: str
    reported_date: date
    equipment_id: str
    equipment_type: str
    inspection_type: str
    inspection_method: str
    finding_description: str
    reported_by: str
    reporter_role: str

    @classmethod
    def from_row(cls, row: dict) -> "Finding":
        return cls(
            finding_id=row["finding_id"].strip(),
            reported_date=date.fromisoformat(row["reported_date"].strip()),
            equipment_id=row["equipment_id"].strip(),
            equipment_type=row["equipment_type"].strip(),
            inspection_type=row["inspection_type"].strip(),
            inspection_method=row["inspection_method"].strip(),
            finding_description=row["finding_description"].strip(),
            reported_by=row["reported_by"].strip(),
            reporter_role=row["reporter_role"].strip(),
        )

    def to_record(self) -> dict:
        return asdict(self) | {"reported_date": self.reported_date.isoformat()}


@dataclass
class Case:
    finding: Finding
    equipment: Equipment
    notes: list[Note] = field(default_factory=list)


def score(raw: str, column: str) -> int:
    value = int(raw.strip())
    if not 1 <= value <= 10:
        raise ValueError(f"{column} must be between 1 and 10, got {value}")
    return value


@dataclass
class Parsed:
    rows: list
    problems: list[str]
    columns: list[str]


def parse_csv(text: str, required: list[str], factory, id_column: str) -> Parsed:
    reader = csv.DictReader(io.StringIO(text))
    columns = [c.strip() for c in (reader.fieldnames or [])]
    missing = [c for c in required if c not in columns]
    if missing:
        return Parsed([], [f"missing column(s): {', '.join(missing)}"], columns)
    rows, problems, seen = [], [], set()
    try:
        for line, raw in enumerate(reader, start=2):
            row = {k.strip(): (v or "") for k, v in raw.items() if k}
            try:
                item = factory(row)
            except (ValueError, KeyError) as error:
                problems.append(f"line {line}: {error}")
                continue
            key = getattr(item, id_column)
            if not key:
                problems.append(f"line {line}: empty {id_column}")
            elif key in seen:
                problems.append(f"line {line}: duplicate {id_column} {key}")
            seen.add(key)
            rows.append(item)
    except csv.Error as error:
        problems.append(f"the file could not be read as CSV: {error}")
    return Parsed(rows, problems, columns)


def parse_registry(text: str) -> Parsed:
    return parse_csv(text, REGISTRY_COLUMNS, Equipment.from_row, "equipment_id")


def parse_findings(text: str) -> Parsed:
    return parse_csv(text, FINDINGS_COLUMNS, Finding.from_row, "finding_id")
