export type ProfileDetail = {
  id: string;
  label: string;
  type: string;
  section: string;
  sectionOrder: number;
  order: number;
  value: string;
  displayValue: string;
  url: string;
};

export type ProfileSectionSummary = { label: string; count: number };

type SlackFieldDefinition = {
  id: string;
  label?: string;
  field_name?: string;
  type?: string;
  ordering?: number;
  section_id?: string;
};

type SlackSectionDefinition = { id: string; label?: string; order?: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

export function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export function fieldValue(rawValue: unknown, alt?: unknown) {
  const raw = cleanText(rawValue);
  const slackLink = raw.match(/^<([^|>]+)(?:\|([^>]+))?>$/);
  const url = slackLink?.[1]?.startsWith("http") ? slackLink[1] : /^https?:\/\//i.test(raw) ? raw : "";
  const displayValue = cleanText(slackLink?.[2] || alt || slackLink?.[1] || raw);
  return { value: raw, displayValue, url };
}

function textOf(value: unknown, depth = 0): string {
  if (value == null || depth > 4) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return cleanText(value);
  if (Array.isArray(value)) return value.map((item) => textOf(item, depth + 1)).filter(Boolean).join(", ");
  if (!isRecord(value)) return "";
  return textOf(
    value.text ?? value.plain_text ?? value.display ?? value.displayValue ?? value.alt ?? value.value ?? value.url,
    depth + 1,
  );
}

function urlOf(value: unknown): string {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  if (!isRecord(value)) return "";
  const candidate = value.url ?? value.href ?? value.link;
  return typeof candidate === "string" && /^https?:\/\//i.test(candidate) ? candidate : "";
}

function isHidden(value: Record<string, unknown>) {
  return value.hidden === true || value.is_hidden === true || value.isHidden === true;
}

function sectionElements(section: Record<string, unknown>) {
  const candidates = [
    section.profileElements, section.profile_elements, section.profileFields, section.profile_fields,
    section.elements, section.fields, section.items, section.contents, section.rows, section.children, section.modules,
  ];
  for (const candidate of candidates) {
    const parsed = parseMaybeJson(candidate);
    if (Array.isArray(parsed)) return parsed.filter(isRecord);
  }
  return [];
}

function looksLikeSection(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return sectionElements(value).length > 0 || Boolean(
    textOf(value.label)
    || value.type
    || value.section_type
    || value.sectionType
    || value.section_id
    || value.sectionId,
  );
}

function collectFromPaths(root: Record<string, unknown>): unknown[] {
  const result = parseMaybeJson(root.result);
  const resultRecord = isRecord(result) ? result : {};
  const data = isRecord(resultRecord.data) ? resultRecord.data : isRecord(root.data) ? root.data : {};
  const user = isRecord(data.user) ? data.user : {};
  const member = isRecord(data.member) ? data.member : {};
  const entity = isRecord(data.entity) ? data.entity : {};
  const userProfile = isRecord(user.profile) ? user.profile : {};
  const memberProfile = isRecord(member.profile) ? member.profile : {};
  const entityProfile = isRecord(entity.profile) ? entity.profile : {};
  const rootProfile = isRecord(root.profile) ? root.profile : {};

  return [
    result,
    root.sections,
    root.profile_sections,
    root.profileSections,
    rootProfile.sections,
    rootProfile.profileSections,
    resultRecord.sections,
    resultRecord.profile_sections,
    resultRecord.profileSections,
    resultRecord.profile_fields,
    user.profileSections,
    userProfile.profileSections,
    userProfile.sections,
    member.profileSections,
    memberProfile.profileSections,
    memberProfile.sections,
    entity.profileSections,
    entityProfile.profileSections,
    entityProfile.sections,
  ];
}

function findSectionArrays(value: unknown, depth = 0, found: unknown[][] = []): unknown[][] {
  if (depth > 6 || found.length > 0) return found;
  if (Array.isArray(value) && value.some(looksLikeSection)) {
    found.push(value);
    return found;
  }
  if (!isRecord(value)) return found;
  for (const child of Object.values(value)) findSectionArrays(child, depth + 1, found);
  return found;
}

export function extractProfileSections(payload: unknown): Record<string, unknown>[] {
  const root = parseMaybeJson(payload);
  if (!isRecord(root)) return [];

  for (const candidate of collectFromPaths(root)) {
    const parsed = parseMaybeJson(candidate);
    if (Array.isArray(parsed) && parsed.some(looksLikeSection)) return parsed.filter(looksLikeSection);
  }

  return (findSectionArrays(root)[0] || []).filter(looksLikeSection);
}

function detailFromElement(element: Record<string, unknown>, sectionLabel: string, sectionOrder: number, index: number): ProfileDetail | null {
  if (isHidden(element)) return null;
  const nested = [element.field, element.profileField, element.profile_field, element.item, element.element].find(isRecord) || {};
  const rawValue = element.value ?? element.text ?? element.displayValue ?? nested.value ?? nested.text ?? nested.displayValue ?? element.alt ?? nested.alt;
  const alt = element.alt ?? nested.alt ?? element.displayValue ?? nested.displayValue ?? element.display_value ?? nested.display_value;
  const normalized = fieldValue(typeof rawValue === "string" ? rawValue : textOf(rawValue), typeof alt === "string" ? alt : textOf(alt));
  const displayValue = normalized.displayValue || textOf(element.displayValue) || textOf(element.display_value) || textOf(element.text) || textOf(nested.text);
  if (!displayValue) return null;

  const label = textOf(element.label) || textOf(nested.label) || textOf(element.field_name) || textOf(nested.field_name) || textOf(element.fieldName) || "Profile detail";
  const id = cleanText(element.id ?? nested.id ?? element.field_id ?? nested.field_id ?? element.fieldId ?? nested.fieldId ?? `${sectionLabel}:${label}:${index}`);
  const url = normalized.url || urlOf(element) || urlOf(nested) || urlOf(rawValue);

  return {
    id: id || `${sectionLabel}:${index}`,
    label,
    type: cleanText(element.type ?? nested.type ?? element.field_type ?? element.elementType ?? "text") || "text",
    section: sectionLabel,
    sectionOrder,
    order: Number(element.ordering ?? element.order ?? nested.ordering ?? index),
    value: normalized.value || displayValue,
    displayValue,
    url,
  };
}

function detailsFromLooseFields(payload: unknown): { details: ProfileDetail[]; sections: ProfileSectionSummary[] } {
  const details: ProfileDetail[] = [];
  const seen = new Set<string>();

  const visit = (value: unknown, depth = 0) => {
    if (depth > 8 || value == null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (!isRecord(value)) return;
    const parsed = detailFromElement(value, textOf(value.section) || "Additional information", Number(value.sectionOrder || 99), details.length);
    if (parsed) {
      const key = `${parsed.id}:${parsed.label}:${parsed.displayValue}`;
      if (!seen.has(key)) {
        seen.add(key);
        details.push(parsed);
      }
    }
    Object.values(value).forEach((child) => visit(child, depth + 1));
  };

  visit(parseMaybeJson(payload));
  return {
    details,
    sections: details.length ? [{ label: "Additional information", count: details.length }] : [],
  };
}

export function detailsFromSections(payload: unknown): { details: ProfileDetail[]; sections: ProfileSectionSummary[] } {
  const sections = extractProfileSections(payload);
  const details: ProfileDetail[] = [];
  const summaries: ProfileSectionSummary[] = [];

  sections.forEach((section, sectionIndex) => {
    const label = textOf(section.label) || textOf(section.type) || textOf(section.section_type) || textOf(section.sectionType) || "Additional information";
    const sectionOrder = Number(section.order ?? section.ordering ?? sectionIndex);
    const elements = sectionElements(section);
    const source = elements.length > 0 ? elements : looksLikeSection(section) && (textOf(section.value) || textOf(section.displayValue)) ? [section] : [];
    const parsed = source
      .map((element, index) => detailFromElement(element, label, sectionOrder, index))
      .filter((detail): detail is ProfileDetail => Boolean(detail));
    summaries.push({ label, count: parsed.length });
    details.push(...parsed);
  });

  if (details.length > 0) return { details, sections: summaries };
  return detailsFromLooseFields(payload);
}

export function detailsFromProfileFields(
  fields: Record<string, { value?: unknown; alt?: unknown; label?: unknown }> | undefined,
  schema: { fields: SlackFieldDefinition[]; sections: SlackSectionDefinition[] },
): ProfileDetail[] {
  const definitions = new Map(schema.fields.map((field) => [field.id, field]));
  const sections = new Map(schema.sections.map((section) => [section.id, section]));

  return Object.entries(fields || {}).flatMap(([fieldId, rawField]) => {
    const normalized = fieldValue(rawField?.value, rawField?.alt);
    if (!normalized.displayValue) return [];
    const definition = definitions.get(fieldId);
    const section = definition?.section_id ? sections.get(definition.section_id) : undefined;
    return [{
      id: fieldId,
      label: cleanText(rawField?.label) || definition?.label || definition?.field_name || "Profile detail",
      type: definition?.type || "text",
      section: section?.label || "Additional information",
      sectionOrder: Number(section?.order || 99),
      order: Number(definition?.ordering || 99),
      ...normalized,
    }];
  });
}

export function mergeProfileDetails(primary: ProfileDetail[], fallback: ProfileDetail[]) {
  const seen = new Set(primary.flatMap((detail) => [detail.id.toLowerCase(), detail.label.trim().toLowerCase()]));
  const extras = fallback.filter((detail) => {
    const id = detail.id.toLowerCase();
    const label = detail.label.trim().toLowerCase();
    if (seen.has(id) || seen.has(label)) return false;
    seen.add(id);
    seen.add(label);
    return true;
  });
  return [...primary, ...extras].sort((left, right) => (
    left.sectionOrder - right.sectionOrder
    || left.order - right.order
    || left.label.localeCompare(right.label)
  ));
}
