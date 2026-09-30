// Builds the D365 Process Catalogue User Guide (v2.0) in the style of v1.0.
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, Header, Footer,
  AlignmentType, WidthType, BorderStyle, ShadingType, VerticalAlign, LevelFormat, PageNumber, PageBreak,
} = require("docx");

const OUT = process.argv[2] || "D365_Process_Catalogue_User_Guide.docx";
const IMG = path.join(__dirname, "img");
const C = { dark: "231F20", grey: "5A5255", cyan: "0E94A8", cyan2: "2BB8D0", orange: "F16320", orange2: "C44D10", band: "F0F4F8", callout: "F5FBFD", line: "CCCCCC" };
const W = 9360; // content width (DXA)

/* ── Text helpers ── */
// Inline markup: **bold**, `code`
function runs(text, base = {}) {
  const out = [];
  for (const part of String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
    if (!part) continue;
    if (part.startsWith("**")) out.push(new TextRun({ ...base, text: part.slice(2, -2), bold: true }));
    else if (part.startsWith("`")) out.push(new TextRun({ ...base, text: part.slice(1, -1), font: "Courier New", size: base.size || 20 }));
    else out.push(new TextRun({ ...base, text: part }));
  }
  return out;
}
const p = (text, opts = {}) => new Paragraph({ spacing: { after: 140, line: 276 }, ...opts, children: runs(text) });
const h1 = (text) => new Paragraph({ style: "Heading1", children: [new TextRun(text)] });
const h2 = (text) => new Paragraph({ style: "Heading2", children: [new TextRun(text)] });
const bullet = (text) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 80 }, children: runs(text) });
let stepList = 0;
const steps = (items) => { const ref = `steps${stepList++}`; numberingConfigs.push(stepConfig(ref));
  return items.map((t) => new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 80 }, children: runs(t) })); };
const spacer = () => new Paragraph({ spacing: { after: 60 }, children: [] });

// Shaded callout box with a cyan left rule, as in v1.0.
function callout(label, text) {
  return new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [W],
    rows: [new TableRow({ children: [new TableCell({
      width: { size: W, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, color: "auto", fill: C.callout },
      margins: { top: 100, bottom: 100, left: 160, right: 120 },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 8, color: C.cyan }, left: { style: BorderStyle.SINGLE, size: 16, color: C.cyan },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: C.cyan }, right: { style: BorderStyle.SINGLE, size: 4, color: "EEEEEE" },
      },
      children: [new Paragraph({ spacing: { after: 60 }, children: [
        new TextRun({ text: `${label}: `, bold: true, color: C.cyan, size: 20 }), ...runs(text, { size: 20 })] })],
    })] })],
  });
}

// Data table: dark header, banded rows. rows = array of arrays of strings; opts.fills colours the first cell per row.
function table(header, rows, widths, opts = {}) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: C.line };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cell = (text, i, { head, fill, color, center, mono } = {}) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.CENTER,
    shading: fill ? { type: ShadingType.CLEAR, color: "auto", fill } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ spacing: { before: 60, after: 60 }, alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: mono ? [new TextRun({ text, font: "Courier New", size: 20 })] : runs(text, { size: 20, bold: head || undefined, color: color || (head ? "FFFFFF" : undefined) }) })],
  });
  return new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: header.map((h, i) => cell(h, i, { head: true, fill: C.dark, center: opts.centerFirst && i === 0 })) }),
      ...rows.map((r, ri) => new TableRow({ children: r.map((t, i) => {
        const first = opts.fills && i === 0 ? opts.fills[ri] : null;
        if (first) return cell(t, i, { head: true, fill: first.fill, color: first.color, center: true });
        return cell(t, i, { fill: ri % 2 ? C.band : undefined, mono: opts.monoCols?.includes(i) });
      }) })),
    ],
  });
}

function figure(file, caption) {
  const px = 624, ratio = 1290 / 2160;
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, children: [new ImageRun({
      type: "png", data: fs.readFileSync(path.join(IMG, file)), transformation: { width: px, height: Math.round(px * ratio) },
      altText: { title: caption, description: caption, name: file } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: caption, italics: true, size: 18, color: C.grey })] }),
  ];
}

const numberingConfigs = [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
  style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }];
const stepConfig = (ref) => ({ reference: ref, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
  style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] });

/* ── Content ── */
const body = [
  // Title block
  new Paragraph({ spacing: { before: 600, after: 80 }, children: [new TextRun({ text: "D365 Process Catalogue", bold: true, size: 64 })] }),
  new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "User Guide", size: 40, color: C.cyan })] }),
  new Paragraph({ spacing: { after: 360 }, children: [new TextRun({ text: "Version 2.0  ·  October 2026  ·  iCatalyst", size: 20, color: C.grey })] }),

  h1("1.  Overview"),
  p("The D365 Process Catalogue organises Microsoft Dynamics 365 business processes into a structured hierarchy, based on Microsoft's Business Process Catalog. It helps clients, consultants and project teams find, understand and agree the processes a Dynamics 365 implementation needs to support."),
  p("Version 2.0 turns the catalogue from a reference into a working tool for client projects. Clients open their own project link, record which processes are in scope, and see iCatalyst's fit/gap assessment alongside. The results export to Excel and to Azure DevOps."),
  callout("Purpose", "Start each Finance and Operations implementation with the right business process alignment: agree scope early, see where standard D365 fits, and carry the decisions straight into the project backlog."),
  spacer(),
  callout("New in version 2.0", "client projects with scoping at every level, iCatalyst fit/gap, scope summary and exports, the iCatalyst master library, client-specific processes, a product filter (including Project Operations), improved search, and the full Microsoft MAR 2026 catalogue with Learn links and D365 menu paths."),

  h1("2.  Getting Started"),
  h2("2.1  Opening the catalogue"),
  p("The catalogue runs in a web browser at **icatalyst-catalogue.pages.dev**. There is nothing to install."),
  bullet("**Clients** receive a private project link from iCatalyst (it ends in `?project=…`). Opening it shows the catalogue with the client's project loaded, ready for scoping."),
  bullet("Without a project link, the catalogue works as a read-only reference."),
  callout("Keep your link private", "anyone with a project link can view and edit that project's scoping. Share it only within your project team."),
  h2("2.2  Screen layout"),
  table(["Area", "What it contains"], [
    ["Top bar", "Catalogue version, your project name, **Scope summary**, search and **Help**."],
    ["Left sidebar", "Application family, **Product** filter, and the list of end-to-end processes."],
    ["Main panel", "The level you are browsing: home, end-to-end process, or process area with its processes and scenarios."],
    ["Right-hand panel", "Details of the selected item: description, references, D365 menu path and, in a project, **Project scoping**."],
  ], [2200, 7160]),
  spacer(),
  h2("2.3  Client and iCatalyst views"),
  p("The catalogue has two views. Clients see the client view by default."),
  table(["View", "Shows", "Used by"], [
    ["Client view", "Finance and Operations only. Other application families are hidden. Scope, priority, owner and notes can be edited; fit/gap is read-only.", "Clients"],
    ["iCatalyst view", "All application families (several can be combined), the **Projects** panel, the master library, and fit/gap editing. Opened with `?view=icatalyst` and the iCatalyst key.", "iCatalyst consultants"],
  ], [1800, 5560, 2000]),

  h1("3.  Process Hierarchy"),
  p("Every item has a unique numeric code that shows its position in the hierarchy. Scoping is done at levels 1 to 4; levels 5 and 6 provide detail for configuration and testing."),
  table(["Level", "Code format", "Name", "Description"], [
    ["L1", "10.00.000.000", "End-to-end process (EPIC)", "Top-level process group, e.g. Source to pay, Record to report."],
    ["L2", "10.10.000.000", "Process area", "A logical grouping of related processes within an end-to-end process."],
    ["L3", "10.10.010.000", "Process", "An individual business process with defined inputs, steps and outcomes."],
    ["L4", "10.10.010.100", "Scenario", "A specific way of running a process, usually tied to a product."],
    ["L5", "10.10.010.100.100", "System process", "Step-by-step D365 activity, often with a menu path."],
    ["L6", "10.10.010.100.100.100", "Test case / config", "A test or configuration item for the system process."],
  ], [900, 2160, 2100, 4200], { fills: [
    { fill: C.cyan, color: "FFFFFF" }, { fill: C.cyan2, color: C.dark }, { fill: C.orange, color: "FFFFFF" },
    { fill: C.orange2, color: "FFFFFF" }, { fill: C.grey, color: "FFFFFF" }, { fill: C.grey, color: "FFFFFF" }], monoCols: [1] }),
  spacer(),
  callout("Example", "`75.50.020.000` = end-to-end process 75 (Source to pay) → process area 75.50 (Manage accounts payable) → process 75.50.020 (Process supplier invoices)."),
  spacer(),
  p("Processes added by iCatalyst or by a client carry letters in their code, for example `75.50.i010.000` or `75.50.CON010.000`. See section 11."),

  h1("4.  Filtering"),
  h2("4.1  Application family"),
  p("The application family at the top of the sidebar sets which part of Dynamics 365 you are looking at."),
  bullet("**Client view:** fixed to **Finance and Operations**."),
  bullet("**iCatalyst view:** choose Business Central, Finance and Operations, Customer Engagement or Azure. Click more than one to combine them."),
  table(["Family", "Products covered", "Typical use"], [
    ["Finance and Operations", "Finance, Supply Chain Management, Project Operations, Field Service, Human Resources", "Enterprise implementations"],
    ["Business Central", "Business Central", "SMB / mid-market implementations"],
    ["Customer Engagement", "Sales, Customer Service, Customer Insights (Journeys and Data), Customer Voice", "CRM and customer-facing implementations"],
    ["Azure", "Azure", "Cloud infrastructure and integration scenarios"],
  ], [2300, 4460, 2600]),
  spacer(),
  h2("4.2  Product filter"),
  p("Below the family, the **Product** buttons narrow the catalogue to one product, such as **Project Operations** or **Supply Chain Management**. Click a product again to clear it."),
  p("A process counts as belonging to a product when any of its scenarios is tagged with that product, which is how the application family filter works too."),
  h2("4.3  How the filters work"),
  bullet("**Home screen and sidebar:** end-to-end processes outside the filter are hidden (client view) or dimmed (iCatalyst view)."),
  bullet("**Process areas and processes:** only those that match are listed."),
  bullet("**Scenarios and diagrams:** only scenarios for the selected products are shown. Custom scenarios always show under their process."),
  bullet("**Search:** results respect both filters."),
  p("In the iCatalyst view, **✕ Clear filters** at the bottom of the family list removes both filters."),

  h1("5.  Navigating the Catalogue"),
  h2("5.1  Home screen"),
  p("The home screen shows the catalogue totals and a card for each end-to-end process, with its code, title, and the number of process areas and processes. In a project, each card also shows its scope."),
  ...figure("01-home.png", "Home screen in the client view, with a project open and Source to pay selected"),
  p("Click a card title to open the end-to-end process, or **Overview** to see its details in the right-hand panel."),
  h2("5.2  End-to-end process view (L1)"),
  p("Shows the process areas within the end-to-end process, each with its number of processes and scenarios. Click a process area title to open it."),
  h2("5.3  Process area view (L2)"),
  p("Lists the processes in the area. Each row shows the code and title, scenario, system process and test counts, and in a project its scope and fit/gap. Click a title to see its details; click **▶** to expand its diagram and scenarios."),
  h2("5.4  Breadcrumb"),
  p("The breadcrumb at the top of the main panel (e.g. **Home › Source to pay › Manage accounts payable**) shows where you are. Click any part to go back to that level."),

  h1("6.  Process Diagrams"),
  p("When a process is expanded, its diagram appears above the scenarios."),
  bullet("**Process map:** where iCatalyst has published a diagram for the process, it is shown. Click it to enlarge, or **Open full size**."),
  bullet("**Auto-generated diagram:** otherwise, a flow of the process's scenarios is drawn automatically. Each box is a scenario, coloured by product; arrows show the typical sequence."),
  p("Switch between **Diagram** and **Scenarios** with the toggle in the diagram header. The auto-generated diagram follows the family and product filters, and the legend shows which product colours are in view."),

  h1("7.  Right-Hand Detail Panel"),
  p("Click any item to see its details. Sections appear only when there is something to show."),
  table(["Section", "What it shows"], [
    ["Project scoping", "In a project: scope, priority, process owner, notes and fit/gap (section 9)."],
    ["Custom process", "For iCatalyst or client-added processes: where it came from, with **Edit** and **Remove** where allowed (section 11)."],
    ["Description", "Microsoft's full description of the item."],
    ["At a glance", "Counts of scenarios, system processes and test cases beneath the item."],
    ["Products", "The D365 products the item applies to."],
    ["Microsoft Docs", "Links to Microsoft Learn articles, where Microsoft provides them."],
    ["Search Microsoft Learn", "A search of Microsoft Learn for the item, available on every item."],
    ["D365 menu", "The navigation path and menu item name in D365, where known."],
    ["References", "Whether Microsoft publishes a process flow for the item, and its APQC ID."],
    ["Partner references", "Links provided by partners, where available."],
  ], [2600, 6760]),
  spacer(),
  p("System processes (L5) with step-by-step instructions have a **Steps** button; those with only a D365 menu path have a **Menu** button."),
  callout("Note", "Microsoft Learn links are sparse in Microsoft's own catalogue (for example, 35 of 674 processes have one). **Search Microsoft Learn for this** fills the gap."),

  h1("8.  Search"),
  p("The search bar is at the top right. Results appear as you type (from two characters); each result shows its level, code and end-to-end process."),
  h2("8.1  How to search"),
  bullet("**Words match in any order:** \"invoice supplier\" finds the same items as \"supplier invoice\"."),
  bullet("**Wildcards:** `*` matches any letters within a word, e.g. `vend* paym*`."),
  bullet("**Codes:** partial codes work, e.g. `60.30` lists everything under Inventory to deliver › Process inbound goods."),
  bullet("Search covers titles, codes and full descriptions of end-to-end processes, process areas, processes and scenarios, and is not case sensitive."),
  h2("8.2  Opening a result"),
  p("Click a result to open it in place: the catalogue goes to its process area, expands the process, scrolls to the item and highlights it. Its details also appear in the right-hand panel."),
  ...figure("06-search.png", "Search results for \"vend* paym*\""),

  h1("9.  Scoping a Client Project"),
  p("With a project link open, the project name appears in the top bar and every process, scenario, process area and end-to-end process can be scoped. Select an item and use **Project scoping** in the right-hand panel. Changes save automatically: choices save straight away, and owner and notes save when you click away from the field. The panel shows **Saving…** then **Saved**."),
  ...figure("02-process-area.png", "Process area with a process expanded and Project scoping in the right-hand panel"),
  h2("9.1  Recording decisions"),
  table(["Field", "Options", "Set by"], [
    ["Scope", "In scope · Later phase · Out of scope (click again to clear)", "Client"],
    ["Priority", "Must have · Should have · Could have · Won't have (now)", "Client"],
    ["Process owner", "Name or role of the person responsible", "Client"],
    ["Notes", "How the business runs the process today, variations, questions", "Client"],
    ["Fit / gap", "Standard · Configuration · Extension · ISV solution · Gap, with notes", "iCatalyst"],
  ], [1900, 5460, 2000]),
  spacer(),
  h2("9.2  How scope flows down"),
  p("A scope decision applies to everything beneath it unless something lower down is set differently. The nearest decision above an item wins."),
  callout("Example", "set **Source to pay** to In scope, set the process area **Source and contract goods and services** to Later phase, and set the process **Process supplier rebates and incentives** to Out of scope. Every other Source to pay process is in scope; the sourcing processes are later; rebates are out."),
  spacer(),
  p("Inherited scope shows as an outlined badge; a decision made on the item itself shows as a solid badge. The panel explains where an inherited decision comes from."),
  h2("9.3  Fit / gap"),
  p("Fit/gap is iCatalyst's assessment of how D365 supports the process. Clients see it but can't change it."),
  table(["Fit / gap", "Meaning"], [
    ["Standard", "Supported by standard D365 without changes."],
    ["Configuration", "Supported through set-up and configuration."],
    ["Extension", "Needs development (customisation) of D365."],
    ["ISV solution", "Met by an independent software vendor's product."],
    ["Gap", "Not supported; needs a workaround or a process change."],
  ], [2300, 7060]),

  h1("10.  Scope Summary and Exports"),
  p("Click **Scope summary** in the top bar for the project's progress: how many processes are decided, a table by end-to-end process (in scope, later, out, undecided), and the fit/gap of in-scope items. Click a row to open that end-to-end process."),
  ...figure("04-scope-summary.png", "Scope summary for a sample client"),
  h2("10.1  Exports"),
  table(["Export", "Contents"], [
    ["Export decisions (Excel CSV)", "One row per item with a decision, plus every custom process: code, level, source, hierarchy, title, scope (and whether inherited), priority, owner, notes, fit/gap and date. Opens directly in Excel."],
    ["Export for Azure DevOps", "An import file for Azure DevOps boards: each end-to-end process becomes an **Epic**, each process area a **Feature**, and each in-scope process a **User Story** with its owner, notes, fit/gap and in-scope scenarios. Priority maps Must/Should/Could/Won't to 1–4."],
  ], [2800, 6560]),
  spacer(),
  callout("Tip", "import the Azure DevOps file into a test project first to confirm it matches your process template before loading it into the live backlog."),

  h1("11.  Custom Processes"),
  p("Processes and scenarios can be added on top of Microsoft's catalogue. They behave like Microsoft's items in every view, filter, search, diagram, summary and export, and are labelled so their source is always clear."),
  table(["Label", "Source", "Code example", "Who can change it"], [
    ["iCatalyst", "iCatalyst master library, copied into the project when it was created", "75.50.i010.000", "iCatalyst only"],
    ["Client", "Added for this client", "75.50.CON010.000", "The client and iCatalyst"],
  ], [1400, 3700, 2160, 2100], { monoCols: [2] }),
  spacer(),
  ...figure("03-custom-process.png", "A client-added process (Client label) in the process list"),
  h2("11.1  Codes"),
  p("Custom codes are assigned automatically, in steps of 10, using a prefix: `i` for the iCatalyst library and the client's initials for client additions."),
  bullet("A **process** added to process area 75.50 → `75.50.CON010.000`, `75.50.CON020.000`, …"),
  bullet("A **scenario** added to process 75.50.020 → `75.50.020.CON010`, `75.50.020.CON020`, …"),
  p("Letters in a code sort after Microsoft's numbers, so custom items appear at the end of each list and never clash with Microsoft codes."),
  h2("11.2  Adding a process or scenario"),
  ...steps([
    "Open the process area (to add a process) or expand the process (to add a scenario).",
    "Click **+ Add process** at the end of the list, or **+ Add scenario** under the scenarios.",
    "Enter a title, an optional description, and the products it relates to.",
    "Click **Add process** / **Add scenario**. The new item opens with its details, ready for scoping.",
  ]),
  h2("11.3  Editing and removing"),
  p("Select a custom item and use **Edit** or **Remove** in the right-hand panel. Removing an item also removes any decisions recorded against it. A process with custom scenarios can't be removed until its scenarios are removed."),

  h1("12.  For iCatalyst Consultants"),
  h2("12.1  iCatalyst view and key"),
  p("Open the catalogue with `?view=icatalyst` once; the browser remembers it. Click **Projects**, paste the iCatalyst key and click **Save**. The key is stored only in that browser and allows creating projects, editing the master library and setting fit/gap. Reload an open project after saving the key."),
  callout("Security", "the view switch alone grants nothing; every protected change is checked against the key on the server. Keep the key private. If it is exposed, it can be replaced."),
  spacer(),
  h2("12.2  Managing projects"),
  ...figure("05-projects.png", "Projects panel in the iCatalyst view"),
  table(["Action", "How"], [
    ["Create a client project", "Enter the client name and initials (2–4 letters), then **Create**. The project starts as a copy of the master library."],
    ["Share with the client", "**Copy client link** and send it to the client's project team."],
    ["Duplicate a project", "**Duplicate** creates a new client project from an existing one, including its decisions and custom processes."],
    ["Set initials", "Projects created before version 2.0 show **Set initials**. Initials are fixed once set, because they become part of process codes."],
  ], [2600, 6760]),
  spacer(),
  h2("12.3  Master library"),
  p("Click **Open master library** to maintain iCatalyst's standard content: library processes and scenarios (`i` codes) and default decisions, such as standard fit/gap positions and notes. The top bar shows **✎ iCatalyst master library** while you are editing it."),
  p("Each new client project takes a snapshot of the master when it is created. Later changes to the master do not change existing client projects, so each client keeps the version it started with."),
  h2("12.4  Refreshing the Microsoft catalogue"),
  p("Microsoft updates the Business Process Catalog periodically. The catalogue is refreshed from Microsoft's spreadsheet by iCatalyst's maintainer (steps are in the project's README). Client decisions are stored by process code, so they carry across to a new catalogue version; the version label (e.g. **MAR 2026**) updates automatically."),

  h1("13.  Quick Reference"),
  table(["Action", "How"], [
    ["Open your project", "Use the project link iCatalyst sent you"],
    ["Filter by product", "Click a product in the sidebar (click again to clear)"],
    ["Browse", "Click an end-to-end process → a process area → ▶ to expand a process"],
    ["See details", "Click any title; details appear in the right-hand panel"],
    ["Search", "Type in the search bar; use several words or `*`; click a result to open it"],
    ["Set scope", "Select an item → **Project scoping** → In scope / Later phase / Out of scope"],
    ["Scope a whole area", "Set scope on the end-to-end process or process area; lower levels follow"],
    ["Add a process or scenario", "**+ Add process** in a process area, or **+ Add scenario** in an expanded process"],
    ["Check progress", "**Scope summary** in the top bar"],
    ["Export", "**Scope summary** → Export decisions (Excel CSV) or Export for Azure DevOps"],
    ["Go back", "Click the breadcrumb, or an end-to-end process in the sidebar"],
  ], [3000, 6360]),
  spacer(),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240 }, children: [new TextRun({ text: "D365 Process Catalogue  ·  iCatalyst  ·  October 2026", size: 18, color: C.grey })] }),
];

const doc = new Document({
  creator: "iCatalyst", title: "D365 Process Catalogue User Guide", description: "User guide, version 2.0",
  styles: {
    default: { document: { run: { font: "Arial", size: 22, color: C.dark } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: C.dark },
        paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0, keepNext: true,
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, space: 1, color: C.cyan } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: C.cyan },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1, keepNext: true } },
    ],
  },
  numbering: { config: numberingConfigs },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1260, right: 1260, header: 708, footer: 708 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, space: 6, color: C.cyan } },
      children: [new TextRun({ text: "D365 Process Catalogue  ", size: 18, color: C.grey }), new TextRun({ text: "User Guide", bold: true, size: 18, color: C.cyan })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: "iCatalyst  ·  D365 Process Catalogue  ·  Page ", size: 16, color: C.grey }),
      new TextRun({ children: [PageNumber.CURRENT], size: 16, color: C.grey }),
      new TextRun({ text: " of ", size: 16, color: C.grey }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: C.grey })] })] }) },
    children: body,
  }],
});

Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(OUT, buf); console.log("wrote", OUT, (buf.length / 1024).toFixed(0) + " KB"); });
