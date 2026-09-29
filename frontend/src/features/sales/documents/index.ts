// Customer documents issued from a lead: Vehicle quotation and Paint Protection Film (PPF) form.
//   pdf.ts                    A4 layout shared by both (logos, parties, tables, terms, signatures)
//   DocumentPreview.tsx       view before download / print
//   CreateDocumentDialogs.tsx issue a quotation / PPF form from a lead
//   LeadDocuments.tsx         the lead's documents (lead page section and leads-list row icon)
//   variantView.tsx           Variant codes (Hyundai), paste from Excel
//   documentViews.tsx         Quotations and PPF forms: list, detail, correct (with who created / changed)
export { buildPpfPdf, buildQuotationPdf, amountInWords } from './pdf';
export { DocumentPreview, type DocKind } from './DocumentPreview';
export { LeadDocuments, LeadDocumentsButton } from './LeadDocuments';
export { ppfView, quotationView } from './documentViews';
export { variantView } from './variantView';
