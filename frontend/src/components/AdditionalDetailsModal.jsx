import Modal from "./Modal.jsx";

const SECTION_LABELS = ["Web research", "Saved posting"];

function briefSections(text) {
  const source = String(text || "").trim();
  if (!source) return [];
  const pattern = new RegExp(`^(${SECTION_LABELS.join("|")})\\n`, "m");
  if (!pattern.test(source)) return [{ label: "", body: source }];

  const sections = [];
  const parts = source.split(new RegExp(`(?=^(?:${SECTION_LABELS.join("|")})\\n)`, "m"));
  for (const part of parts) {
    const block = part.trim();
    if (!block) continue;
    const newline = block.indexOf("\n");
    const label = newline === -1 ? block : block.slice(0, newline);
    if (!SECTION_LABELS.includes(label)) {
      sections.push({ label: "", body: block });
      continue;
    }
    sections.push({ label, body: newline === -1 ? "" : block.slice(newline + 1).trim() });
  }
  return sections.length ? sections : [{ label: "", body: source }];
}

export default function AdditionalDetailsModal({ title, text, onClose }) {
  const sections = briefSections(text);

  return (
    <Modal title={title || "Additional details"} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        {sections.map((section, index) => (
          <section key={`${section.label}-${index}`}>
            {section.label && <h3 className="mb-2 text-sm font-semibold text-white">{section.label}</h3>}
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">{section.body || "Nothing saved here."}</p>
          </section>
        ))}
      </div>
    </Modal>
  );
}
