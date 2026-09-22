export const DETAIL_GROUP_LABELS = {
  identity: "Identity",
  contact: "Contact",
  education: "Education",
  workExperience: "Work experience",
  selfProjects: "Self projects",
  extraDetails: "Extra details",
};

export const DETAIL_GROUP_ORDER = [
  "identity",
  "contact",
  "education",
  "workExperience",
  "selfProjects",
  "extraDetails",
];

export function groupFields(fields) {
  const groups = [];
  const indexByName = new Map();

  for (const field of fields) {
    const name = field.group || "other";
    if (!indexByName.has(name)) {
      indexByName.set(name, groups.length);
      groups.push({
        name,
        label: DETAIL_GROUP_LABELS[name] || "Other",
        fields: [],
      });
    }
    groups[indexByName.get(name)].fields.push(field);
  }

  return groups;
}

export function schemaKeySets(schema) {
  const detailKeys = new Set((schema?.details || []).map((field) => field.key).filter(Boolean));
  const extraKeys = new Set((schema?.extraDetails || []).map((field) => field.key).filter(Boolean));
  return { detailKeys, extraKeys };
}

export function splitSavedDetails(details, schema) {
  const { extraKeys } = schemaKeySets(schema);
  const basic = [];
  const extra = [];

  for (const field of details || []) {
    if (field.group === "extraDetails" || extraKeys.has(field.key)) {
      extra.push(field);
    } else {
      basic.push(field);
    }
  }

  return { basic, extra };
}

export function groupSavedFields(fields) {
  const groups = [];
  const indexByName = new Map();

  for (const field of fields || []) {
    const name = field.group || "other";
    if (!indexByName.has(name)) {
      indexByName.set(name, groups.length);
      groups.push({
        name,
        label: DETAIL_GROUP_LABELS[name] || "Other",
        fields: [],
      });
    }
    groups[indexByName.get(name)].fields.push(field);
  }

  return groups.sort(
    (a, b) =>
      (DETAIL_GROUP_ORDER.indexOf(a.name) === -1 ? 99 : DETAIL_GROUP_ORDER.indexOf(a.name)) -
      (DETAIL_GROUP_ORDER.indexOf(b.name) === -1 ? 99 : DETAIL_GROUP_ORDER.indexOf(b.name))
  );
}

export function shouldHideField(field, values) {
  const rule = field?.hideWhen;
  if (!rule?.field) return false;
  const actual = values?.[rule.field];
  if (Object.prototype.hasOwnProperty.call(rule, "equals")) {
    return actual === rule.equals || String(actual) === String(rule.equals);
  }
  if (Object.prototype.hasOwnProperty.call(rule, "notEquals")) {
    return actual !== rule.notEquals && String(actual) !== String(rule.notEquals);
  }
  return false;
}

export function optionDisplayValue(field, rawValue) {
  if (!field?.options?.length || rawValue == null || rawValue === "") return rawValue;
  const match = field.options.find((option) => option.value === rawValue || option.label === rawValue);
  return match?.label || rawValue;
}

export function emptyRepeatEntry(field) {
  const entry = {};
  for (const sub of field.fields || []) {
    if (sub.type === "tags") entry[sub.key] = [];
    else if (sub.type === "checkbox") entry[sub.key] = false;
    else entry[sub.key] = "";
  }
  return entry;
}

export function emptyDuration() {
  return { years: "", months: "" };
}

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function parseMonthValue(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function parseDateValue(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { year, month, day };
}

export function formatMonthLabel(value) {
  const parsed = parseMonthValue(value);
  if (!parsed) return "";
  return `${MONTH_LABELS[parsed.month - 1]} ${parsed.year}`;
}

export function formatDateLabel(value) {
  const parsed = parseDateValue(value);
  if (!parsed) return "";
  return `${parsed.day} ${MONTH_LABELS[parsed.month - 1]} ${parsed.year}`;
}

function monthFromStored(raw) {
  const iso = parseMonthValue(raw);
  if (iso) return `${iso.year}-${String(iso.month).padStart(2, "0")}`;
  const match = String(raw || "").trim().match(/^([A-Za-z]{3,})\.?\s+(\d{4})$/);
  if (!match) return "";
  const name = match[1].toLowerCase();
  const index = MONTH_LABELS.findIndex((label) => label.toLowerCase() === name || label.toLowerCase().startsWith(name));
  if (index < 0) return "";
  return `${match[2]}-${String(index + 1).padStart(2, "0")}`;
}

export function storedToInput(field, raw) {
  if (!field) return "";
  if (field.type === "tags") {
    if (Array.isArray(raw)) return raw.map((item) => String(item).trim()).filter(Boolean);
    return String(raw || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (field.type === "checkbox") return raw === true || raw === "true" || raw === "Yes";
  if (field.type === "duration") {
    if (raw && typeof raw === "object") {
      return { years: String(raw.years ?? ""), months: String(raw.months ?? "") };
    }
    const text = String(raw || "");
    return {
      years: text.match(/(\d+)\s*year/)?.[1] || "",
      months: text.match(/(\d+)\s*month/)?.[1] || "",
    };
  }
  if (field.type === "month") return monthFromStored(raw);
  if (field.type === "date") {
    if (parseDateValue(raw)) return String(raw).trim();
    return "";
  }
  if (field.type === "select") {
    const text = String(raw ?? "").trim().toLowerCase();
    const match = (field.options || []).find(
      (option) => option.value === raw || option.label === raw || String(option.label).toLowerCase() === text
    );
    return match?.value || "";
  }
  if (raw == null || typeof raw === "boolean") return "";
  return String(raw);
}

export function schemaFieldByKey(schema, key) {
  return [...(schema?.details || []), ...(schema?.extraDetails || [])].find((field) => field.key === key) || null;
}

export function displayGroups(tab, fields) {
  const saved = groupSavedFields(fields);
  if (tab === "extra") {
    const extra = saved.find((group) => group.name === "extraDetails") || {
      name: "extraDetails",
      label: DETAIL_GROUP_LABELS.extraDetails,
      fields: [],
    };
    const rest = saved.filter((group) => group.name !== "extraDetails");
    return [extra, ...rest];
  }
  if (tab !== "details") return saved;
  const standard = DETAIL_GROUP_ORDER.filter((name) => name !== "extraDetails");
  const byName = new Map(saved.map((group) => [group.name, group]));
  const ordered = standard.map(
    (name) =>
      byName.get(name) || {
        name,
        label: DETAIL_GROUP_LABELS[name] || name,
        fields: [],
      }
  );
  const rest = saved.filter((group) => !standard.includes(group.name));
  return [...ordered, ...rest];
}

function scalarFromField(field, rawValue) {
  if (field.type === "tags") {
    return Array.isArray(rawValue)
      ? rawValue.map((item) => String(item).trim()).filter(Boolean)
      : String(rawValue || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
  }
  if (field.type === "checkbox") {
    return Boolean(rawValue);
  }
  if (field.type === "duration") {
    const years = String(rawValue?.years ?? "").trim();
    const months = String(rawValue?.months ?? "").trim();
    if (!years && !months) return "";
    const parts = [];
    if (years) parts.push(`${years} year${years === "1" ? "" : "s"}`);
    if (months) parts.push(`${months} month${months === "1" ? "" : "s"}`);
    return parts.join(" ");
  }
  if (field.type === "month") {
    return formatMonthLabel(rawValue) || String(rawValue ?? "").trim();
  }
  if (field.type === "date") {
    return formatDateLabel(rawValue) || String(rawValue ?? "").trim();
  }
  return optionDisplayValue(field, String(rawValue ?? "").trim());
}

export function valuesToAnswer(field, rawValue) {
  if (field.type === "tags") {
    return scalarFromField(field, rawValue).map((value) => ({ value }));
  }
  if (field.type === "checkbox") {
    return rawValue ? [{ value: "Yes" }] : [];
  }
  const value = scalarFromField(field, rawValue);
  return value ? [{ value }] : [];
}

function formatRepeatEntry(field, data) {
  if (field.key === "education") {
    const title = [data.degree, data.fieldOfStudy].filter(Boolean).join(" in ");
    const dates = [data.startDate, data.endDate].filter(Boolean).join(" – ");
    return [title, data.school, dates, data.grade].filter(Boolean).join(" · ");
  }
  if (field.key === "workExperience") {
    const dates = data.currentlyWorking
      ? [data.startDate, "Present"].filter(Boolean).join(" – ")
      : [data.startDate, data.endDate].filter(Boolean).join(" – ");
    return [data.jobTitle, data.organization, data.locationType, dates].filter(Boolean).join(" · ");
  }
  if (field.key === "selfProjects") {
    return [data.title, data.subtitle].filter(Boolean).join(" — ");
  }
  return Object.values(data)
    .flat()
    .filter(Boolean)
    .join(" · ");
}

function collectRepeatField(field, entries) {
  const answer = (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const data = {};
      for (const sub of field.fields || []) {
        if (shouldHideField(sub, entry)) continue;
        const scalar = scalarFromField(sub, entry?.[sub.key]);
        if (sub.type === "checkbox") {
          if (scalar) data[sub.key] = true;
          continue;
        }
        if (Array.isArray(scalar)) {
          if (scalar.length) data[sub.key] = scalar;
        } else if (scalar) {
          data[sub.key] = scalar;
        }
      }
      if (Object.keys(data).length === 0) return null;
      return { value: formatRepeatEntry(field, data) || field.itemLabel || field.label, data };
    })
    .filter(Boolean);

  if (!answer.length) return null;
  return { key: field.key, label: field.label, answer, group: field.group };
}

export function answersToRepeatEntries(schemaField, answers) {
  return (Array.isArray(answers) ? answers : []).map((item) => {
    const entry = emptyRepeatEntry(schemaField);
    const data = item?.data && typeof item.data === "object" ? item.data : {};
    for (const sub of schemaField.fields || []) {
      if (Object.prototype.hasOwnProperty.call(data, sub.key)) {
        entry[sub.key] = storedToInput(sub, data[sub.key]);
      }
    }
    return entry;
  });
}

export function buildRepeatField(schemaField, entries) {
  return collectRepeatField(schemaField, entries);
}

function collectExtraFields(field, items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const label = String(item?.label || "").trim();
      const value = String(item?.value || "").trim();
      if (!label || !value) return null;
      return { label, answer: [{ value }], group: field.group };
    })
    .filter(Boolean);
}

export function collectFilledFields(schemaFields, values) {
  const collected = [];

  for (const field of schemaFields || []) {
    if (shouldHideField(field, values)) continue;

    if (field.type === "repeat") {
      const item = collectRepeatField(field, values[field.key]);
      if (item) collected.push(item);
      continue;
    }

    if (field.type === "extraFields") {
      collected.push(...collectExtraFields(field, values[field.key]));
      continue;
    }

    const answer = valuesToAnswer(field, values[field.key]);
    if (!answer.length) continue;
    collected.push({ key: field.key, label: field.label, answer, group: field.group });
  }

  return collected;
}

export function requiredFieldErrors(schemaFields, values) {
  return (schemaFields || [])
    .filter((field) => field.required && !["repeat", "extraFields"].includes(field.type))
    .filter((field) => !shouldHideField(field, values))
    .filter((field) => valuesToAnswer(field, values[field.key]).length === 0)
    .map((field) => field.label);
}

export function initialFormValues(schemaFields) {
  const values = {};
  for (const field of schemaFields || []) {
    if (field.type === "repeat") values[field.key] = [emptyRepeatEntry(field)];
    else if (field.type === "extraFields") values[field.key] = [];
    else if (field.type === "tags") values[field.key] = [];
    else if (field.type === "checkbox") values[field.key] = false;
    else if (field.type === "duration") values[field.key] = emptyDuration();
    else values[field.key] = "";
  }
  return values;
}

function coerceFieldValue(field, raw) {
  if (raw == null) return undefined;

  if (field.type === "repeat") {
    if (!Array.isArray(raw) || raw.length === 0) return undefined;
    return raw.map((entry) => {
      const base = emptyRepeatEntry(field);
      if (!entry || typeof entry !== "object") return base;
      for (const sub of field.fields || []) {
        const coerced = coerceFieldValue(sub, entry[sub.key]);
        if (coerced !== undefined) base[sub.key] = coerced;
      }
      return base;
    });
  }

  if (field.type === "extraFields") {
    if (!Array.isArray(raw)) return undefined;
    return raw
      .filter((item) => item && typeof item === "object")
      .map((item) => ({ label: String(item.label || ""), value: String(item.value || "") }));
  }

  if (field.type === "tags") {
    if (!Array.isArray(raw)) return undefined;
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }

  if (field.type === "checkbox") return Boolean(raw);

  if (field.type === "duration") {
    if (!raw || typeof raw !== "object") return undefined;
    return { years: String(raw.years ?? ""), months: String(raw.months ?? "") };
  }

  if (typeof raw === "string" || typeof raw === "number") return String(raw);
  return undefined;
}

export function buildFormValues(schemaFields, extracted) {
  const values = initialFormValues(schemaFields);
  if (!extracted || typeof extracted !== "object" || Array.isArray(extracted)) return values;

  for (const field of schemaFields || []) {
    if (!Object.prototype.hasOwnProperty.call(extracted, field.key)) continue;
    const next = coerceFieldValue(field, extracted[field.key]);
    if (next !== undefined) values[field.key] = next;
  }

  return values;
}
