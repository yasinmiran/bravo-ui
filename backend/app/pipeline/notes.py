"""Step 2: facts the model cannot see from one finding, found by code first."""

import re

from app.models.inputs import Case, Equipment, Finding, Note, NoteKind
from app.models.rules import RedundancyEntry, Rules

SENTENCE_END = re.compile(r"(?<=[.!?])\s+")
PARTNER_TAG = re.compile(r"\(([A-Z]+-\d+)\)")
VOTING = re.compile(r"(\d+)oo(\d+)", re.IGNORECASE)


def annotate_batch(
        cases: list[Case],
        registry: dict[str, Equipment],
        findings_by_equipment: dict[str, list[Finding]],
        rules: Rules,
) -> None:
    for siblings in findings_by_equipment.values():
        siblings.sort(key=lambda f: f.reported_date)
    for case in cases:
        own, eq = case.finding, case.equipment
        for other in findings_by_equipment[eq.equipment_id]:
            if other.finding_id != own.finding_id:
                case.notes.append(sibling_note(other))
        case.notes.extend(redundancy_notes(eq, rules.redundancy_vocabulary.get(eq.redundancy), registry, findings_by_equipment))


def redundancy_notes(
        eq: Equipment,
        entry: RedundancyEntry | None,
        registry: dict[str, Equipment],
        findings_by_equipment: dict[str, list[Finding]],
) -> list[Note]:
    if entry is None:
        return [Note(NoteKind.REDUNDANCY_UNCLASSIFIED,
                     f"Redundancy value {eq.redundancy!r} is not in the rules vocabulary; treat it as unverified and do not credit it.")]
    if entry.kind in ("none", "bypass"):
        return []
    if entry.kind == "voted":
        return [Note(NoteKind.VOTED_GROUP, voted_text(eq.redundancy, entry))]
    partner = entry.partner or (m.group(1) if (m := PARTNER_TAG.search(eq.redundancy)) else "")
    if not partner:
        return [Note(NoteKind.REDUNDANCY_UNCLASSIFIED,
                     f"Redundancy value {eq.redundancy!r} names no partner; do not credit it.")]
    if partner not in registry:
        return [Note(NoteKind.PARTNER_UNVERIFIED,
                     f"Redundant partner {partner} is not in the registry; its condition cannot be verified.")]
    if partner in findings_by_equipment:
        ids = ", ".join(f.finding_id for f in findings_by_equipment[partner])
        return [Note(NoteKind.PARTNER_HAS_FINDING,
                     f"Redundant partner {partner} also has an open finding in this inspection period: {ids}. Do not credit redundancy.")]
    return []


def voted_text(redundancy: str, entry: RedundancyEntry) -> str:
    m = VOTING.search(redundancy)
    if not m:
        return entry.note or f"{redundancy} group: one failed member is a degradation, not a defeat; margin is reduced."
    need, total = int(m.group(1)), int(m.group(2))
    remaining = total - 1
    tail = "the next failure defeats it" if need >= remaining else f"{remaining - need} more failure(s) before it is defeated"
    return (f"{redundancy} group: with one member lost it runs {need}oo{remaining}, "
            f"{'all' if need == remaining else need} remaining members must agree; degradation, not defeat, but {tail}.")


def sibling_note(finding: Finding) -> Note:
    return Note(
        NoteKind.SIBLING,
        f"Other finding on {finding.equipment_id} in this inspection period: {finding.finding_id} "
        f"({finding.reported_date}): {leading_sentences(finding.finding_description, 2)}",
    )


def leading_sentences(text: str, n: int) -> str:
    return " ".join(SENTENCE_END.split(text.strip(), maxsplit=n)[:n])
