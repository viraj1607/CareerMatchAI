import "server-only";
import PDFDocument from "pdfkit";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { contentHasResumeText, deduplicateResumeContent, resumeContentSchema, safeResumeFileName, type ResumeContent } from "@/lib/resume-editor";

export class ResumeExportError extends Error {
  constructor(readonly code: "INVALID_CONTENT" | "EMPTY_RESUME" | "EXPORT_FAILED") { super(code); this.name = "ResumeExportError"; }
}

export function validateResumeForExport(value: unknown): ResumeContent {
  const parsed = resumeContentSchema.safeParse(value);
  if (!parsed.success) throw new ResumeExportError("INVALID_CONTENT");
  if (!contentHasResumeText(parsed.data)) throw new ResumeExportError("EMPTY_RESUME");
  return parsed.data;
}

function contactLine(content: ResumeContent): string {
  return [content.contact.email, content.contact.phone, content.contact.location, content.contact.website].filter(Boolean).join(" | ");
}

function printableSections(content: ResumeContent): Array<{ title: string; values: Array<{ text: string; bold?: boolean; bullet?: boolean }> }> {
  const sections: Array<{ title: string; values: Array<{ text: string; bold?: boolean; bullet?: boolean }> }> = [];
  if (content.summary.trim()) sections.push({ title: "Professional Summary", values: [{ text: content.summary.trim() }] });
  const experience = content.experience;
  if (experience.length) sections.push({ title: "Work Experience", values: experience.flatMap((entry) => [
    ...(entry.jobTitle.trim() || entry.employer.trim() ? [{ text: entry.jobTitle.trim() || entry.employer.trim(), bold: true }] : []),
    ...(entry.employer.trim() && entry.jobTitle.trim() ? [{ text: entry.employer.trim() }] : []),
    { text: [entry.location, entry.dates].filter(Boolean).join(" | ") },
    ...(entry.description.trim() ? [{ text: entry.description.trim() }] : []),
    ...entry.bullets.map((text) => ({ text, bullet: true })),
  ].filter((line) => line.text)) });
  const education = content.education;
  if (education.length) sections.push({ title: "Education", values: education.flatMap((entry) => [
    ...(entry.qualification.trim() || entry.institution.trim() ? [{ text: entry.qualification.trim() || entry.institution.trim(), bold: true }] : []),
    ...(entry.institution.trim() && entry.qualification.trim() ? [{ text: entry.institution.trim() }] : []),
    { text: [entry.location, entry.dates].filter(Boolean).join(" | ") },
    ...(entry.details.trim() ? [{ text: entry.details.trim() }] : []),
  ].filter((line) => line.text)) });
  const skills = content.skills.map((item) => item.text.trim());
  if (skills.length) sections.push({ title: "Skills", values: [{ text: skills.join(" · ") }] });
  const certifications = content.certifications.map((item) => item.text.trim());
  if (certifications.length) sections.push({ title: "Certifications", values: certifications.map((text) => ({ text, bullet: true })) });
  const projects = content.projects.map((item) => item.text.trim());
  if (projects.length) sections.push({ title: "Projects", values: projects.map((text) => ({ text, bullet: true })) });
  if (content.additionalInformation.trim()) sections.push({ title: "Additional Information", values: [{ text: content.additionalInformation.trim() }] });
  return sections;
}

function makePdf(content: ResumeContent): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margins: { top: 48, bottom: 48, left: 58, right: 58 }, bufferPages: true, info: { Title: "Resume", Author: content.contact.name || "CareerMatch AI" } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const bottom = () => doc.page.height - doc.page.margins.bottom;
    const ensureRoom = (height: number) => { if (doc.y + height > bottom()) doc.addPage(); };
    const paragraph = (text: string, font: string, size: number, color: string, gap = 5) => {
      if (!text.trim()) return;
      doc.font(font).fontSize(size).fillColor(color);
      const height = doc.heightOfString(text, { width: usableWidth, lineGap: 2 }) + gap;
      if (height < doc.page.height - 96 && doc.y + height > bottom()) doc.addPage();
      doc.text(text, { width: usableWidth, lineGap: 2 });
      doc.moveDown(gap / Math.max(size, 1));
    };

    if (content.contact.name.trim()) paragraph(content.contact.name.trim(), "Helvetica-Bold", 21, "#1f3429", 3);
    if (contactLine(content)) paragraph(contactLine(content), "Helvetica", 9, "#526258", 9);
    for (const section of printableSections(content)) {
      ensureRoom(44);
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#176b50").text(section.title.toLocaleUpperCase(), { width: usableWidth, lineBreak: true });
      doc.moveDown(0.25);
      for (const item of section.values) {
        if (!item.text.trim()) continue;
        if (item.bold) ensureRoom(90);
        if (item.bullet) {
          const height = doc.heightOfString(item.text, { width: usableWidth - 18, lineGap: 2 }) + 5;
          if (height < doc.page.height - 100 && doc.y + height > bottom()) doc.addPage();
          doc.font("Helvetica").fontSize(9.5).fillColor("#2f3e35").text(`• ${item.text}`, { width: usableWidth - 16, lineGap: 2, indent: 10 });
          doc.moveDown(0.2);
        } else paragraph(item.text, item.bold ? "Helvetica-Bold" : "Helvetica", item.bold ? 10 : 9.5, "#2f3e35", 4);
      }
      doc.moveDown(0.35);
    }

    const range = doc.bufferedPageRange();
    for (let index = 0; index < range.count; index++) {
      doc.switchToPage(index);
      doc.font("Helvetica").fontSize(8).fillColor("#77837b").text(`Page ${index + 1} of ${range.count}`, doc.page.margins.left, doc.page.height - 32, { width: usableWidth, align: "right", lineBreak: false });
    }
    doc.end();
  });
}

function makeDocx(content: ResumeContent): Promise<Buffer> {
  const children: Paragraph[] = [];
  if (content.contact.name.trim()) children.push(new Paragraph({ children: [new TextRun({ text: content.contact.name.trim(), bold: true, font: "Arial", size: 36 })], spacing: { after: 100 } }));
  const contact = contactLine(content);
  if (contact) children.push(new Paragraph({ children: [new TextRun({ text: contact, font: "Arial", size: 18, color: "526258" })], spacing: { after: 240 } }));
  for (const section of printableSections(content)) {
    children.push(new Paragraph({ children: [new TextRun({ text: section.title, font: "Arial", size: 22, color: "176B50", bold: true })], heading: HeadingLevel.HEADING_2, keepNext: true, spacing: { before: 180, after: 80 } }));
    for (const item of section.values) {
      if (!item.text.trim()) continue;
      for (const line of item.text.split(/\r?\n/).map((part) => part.trimEnd()).filter((part) => part.trim())) {
        children.push(new Paragraph({
          children: [new TextRun({ text: line, bold: item.bold, font: "Arial", size: item.bold ? 21 : 19, color: "2F3E35" })],
          bullet: item.bullet ? { level: 0 } : undefined,
          indent: item.bullet ? { left: 320, hanging: 180 } : undefined,
          spacing: { after: item.bullet ? 50 : 90, line: 276 },
          keepLines: true,
          keepNext: item.bold,
        }));
      }
    }
  }
  const document = new Document({
    creator: "CareerMatch AI",
    title: "Resume",
    sections: [{ properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children }],
    styles: { default: { document: { run: { font: "Arial", size: 19, color: "2F3E35" }, paragraph: { spacing: { line: 276 } } } } },
  });
  return Packer.toBuffer(document);
}

export async function generateResumeExport(value: unknown, format: "pdf" | "docx"): Promise<{ bytes: Buffer; fileName: string; contentType: string }> {
  let content: ResumeContent;
  try { content = deduplicateResumeContent(validateResumeForExport(value)); }
  catch (error) { throw error; }
  try {
    const bytes = format === "pdf" ? await makePdf(content) : await makeDocx(content);
    return { bytes, fileName: safeResumeFileName(content.contact.name, format), contentType: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  } catch {
    throw new ResumeExportError("EXPORT_FAILED");
  }
}
