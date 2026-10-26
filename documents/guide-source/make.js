// Builds the After Sales and Store user guide (Word) from content.js.  Run: npm run build
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  AlignmentType, HeadingLevel, Footer, PageNumber, PageBreak, LevelFormat,
} = require('docx');
const c = require('./content.js');

const BLUE = '1E3A8A';
const GREY = 'F1F5F9';
const AMBER = 'FEF3C7';
const FONT = 'Calibri';
const out = process.argv[2] || path.join(__dirname, '..', 'After-Sales-and-Store-User-Guide.docx');

const run = (text, o = {}) => new TextRun({ text, font: FONT, ...o });
const p = (text, o = {}) => new Paragraph({ spacing: { after: 100 }, ...o, children: [run(text, o.run)] });
const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, spacing: { before: 0, after: 160 }, children: [run(text, { bold: true, size: 36, color: BLUE })] });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 80 }, keepNext: true, children: [run(text, { bold: true, size: 26, color: BLUE })] });
const bullet = (text) => new Paragraph({ numbering: { reference: 'bul', level: 0 }, spacing: { after: 60 }, children: [run(text)] });
const num = (text, ref) => new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 70 }, children: [run(text)] });
const note = (text) =>
  new Paragraph({
    spacing: { before: 80, after: 120 },
    shading: { type: ShadingType.CLEAR, fill: AMBER },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'F59E0B', space: 6 } },
    indent: { left: 120 },
    children: [run('Note: ', { bold: true }), run(text)],
  });

const border = { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' };
const borders = { top: border, bottom: border, left: border, right: border };
const cell = (text, w, o = {}) =>
  new TableCell({
    borders,
    width: { size: w, type: WidthType.DXA },
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({ alignment: o.center ? AlignmentType.CENTER : AlignmentType.LEFT, children: [run(text, { bold: o.bold, color: o.color, size: o.size })] })],
  });
function table(widths, head, rows, o = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, widths[i], { fill: BLUE, bold: true, color: 'FFFFFF', size: o.size, center: i > 0 && o.centerRest })) }),
      ...rows.map((r, n) => new TableRow({ cantSplit: true, children: r.map((v, i) => cell(v, widths[i], { fill: n % 2 ? GREY : undefined, bold: i === 0, size: o.size, center: i > 0 && o.centerRest })) })),
    ],
  });
}

const children = [];
let numbering = 0;
const numberings = [];
const nextSteps = () => {
  const ref = `steps${++numbering}`;
  numberings.push({ reference: ref, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: 'Step %1:', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 900, hanging: 900 } }, run: { bold: true, color: BLUE, font: FONT } } }] });
  return ref;
};

// ---- cover
children.push(new Paragraph({ spacing: { before: 2400, after: 120 }, children: [run(c.title, { bold: true, size: 64, color: BLUE })] }));
children.push(new Paragraph({ spacing: { after: 400 }, children: [run(c.subtitle, { bold: true, size: 44 })] }));
children.push(p(c.system, { run: { size: 28 } }));
children.push(p(c.dealerships, { run: { size: 24, color: '475569' } }));
children.push(p(c.audience, { spacing: { before: 400, after: 100 }, run: { size: 22 } }));
children.push(p(c.version, { run: { size: 22, color: '475569' } }));

// ---- how to use, who does what, flow
children.push(h1('How to use this guide'));
c.howToUse.forEach((t) => children.push(p(t)));
children.push(h2('Who does what'));
children.push(table([2400, 6960], ['Role', 'Main tasks'], c.whoDoesWhat));
children.push(h2('The order of a job'));
const flowRef = nextSteps();
c.flow.forEach((t) => children.push(num(t, flowRef)));

// ---- contents
children.push(h1('Contents'));
c.chapters.forEach((ch, i) => {
  children.push(new Paragraph({ spacing: { before: 120, after: 40 }, children: [run(`${i + 1}. ${ch.title}`, { bold: true, size: 24 })] }));
  ch.tasks.forEach((t, k) => children.push(new Paragraph({ indent: { left: 360 }, spacing: { after: 20 }, children: [run(`${i + 1}.${k + 1}  ${t.t}`, { size: 21 })] })));
});
children.push(new Paragraph({ spacing: { before: 120, after: 40 }, children: [run(`${c.chapters.length + 1}. Who can do what`, { bold: true, size: 24 })] }));
children.push(new Paragraph({ spacing: { before: 120, after: 40 }, children: [run(`${c.chapters.length + 2}. Changing this guide`, { bold: true, size: 24 })] }));

// ---- chapters
c.chapters.forEach((ch, i) => {
  children.push(h1(`${i + 1}. ${ch.title}`));
  children.push(p(ch.intro));
  if (ch.login) children.push(p(ch.login, { run: { italics: true, color: '475569' } }));
  ch.tasks.forEach((t, k) => {
    children.push(h2(`${i + 1}.${k + 1}  ${t.t}`));
    children.push(p(t.intro));
    const ref = nextSteps();
    t.steps.forEach((s) => children.push(num(s, ref)));
    if (t.note) children.push(note(t.note));
  });
});

// ---- access table
const nChap = c.chapters.length;
children.push(h1(`${nChap + 1}. Who can do what`));
children.push(p('The standard rights of each role for the after-sales and store work. Yes = can do it; View = can look but not change; – = no access. The Dealership Manager column covers the dealership’s own manager; the System Admin can do everything.'));
const first = 3000;
const rest = Math.floor((9360 - first) / c.accessColumns.length);
children.push(table([first, ...c.accessColumns.map(() => rest)], ['Task', ...c.accessColumns], c.access, { size: 16, centerRest: true }));
children.push(p(' '));
children.push(note('Technician logins are not used at Jetour and Hyundai at present. The Service Advisor cannot assign, start or complete a job card; at those dealerships the Service Manager does this.'));

// ---- changing the guide
children.push(h1(`${nChap + 2}. Changing this guide`));
c.changing.forEach((t) => children.push(p(t)));
children.push(h2('Still to be decided'));
c.openItems.forEach((t) => children.push(bullet(t)));

const doc = new Document({
  creator: 'Ittehad DMS',
  title: `${c.title} ${c.subtitle}`,
  styles: { default: { document: { run: { font: FONT, size: 22 } } } },
  numbering: {
    config: [
      { reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
      ...numberings,
    ],
  },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1273, right: 1273 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(`${c.title} ${c.subtitle} · page `, { size: 16, color: '64748B' }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '64748B' })] })] }) },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(out, buf);
  console.log('written', out, buf.length);
});
