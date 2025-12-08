// #set text(font: "CharisSIL-Regular")
// #set text(font: "Suissnord Deux D")
// ============================================================
// ELSEVIER JOURNAL ARTICLE TEMPLATE
// ============================================================
// Usage: Copy this file and modify the configuration below
// ============================================================

#let elsevier-article(
  // Journal Information
  journal: "Journal Name",
  journal-url: "https://www.elsevier.com/locate/journal",
  doi: "10.1016/j.xxx.2025.xxxxxx",
  pii: "S0000-0000(00)00000-0",

  // Article Dates
  received: "DD Month YYYY",
  revised: "DD Month YYYY",
  accepted: "DD Month YYYY",

  // Article Content
  title: "Article Title",
  authors: (),
  affiliations: (:),
  labelAinfo: "Abstract Info",
  abstractLabel: "Abstract",
  abstract: [],
  highlights: (),
  keywords: "",

  // Document body
  body,
) = {
  // Document metadata
  set document(
    title: title,
    author: authors.map(a => a.name),
  )
  // Page setup
  set page(
    paper: "a4",
    margin: (
      top: 2cm,
      bottom: 2.5cm,
      left: 1.5cm,
      right: 1.5cm
    ),
    header: context {
      if counter(page).get().first() > 1 [
        #set text(size: 9pt)
        #authors.first().name.split(" ").last() et al. #h(1fr) #journal
      ]
    },
     // Footer visible ONLY on page 1
    footer: context {
      let pg = counter(page).get().at(0)
      if pg == 1 [
        #set text(size: 9pt)
        #line(length: 10%, stroke: 1pt)
        #align(left)[
        #text(size: 8pt)[
          #let corr-authors = authors.filter(a => a.at("corr", default: false))
          #for (i, author) in corr-authors.enumerate() [
            #if i == 0 [#super[⁎]] else [#super[⁎⁎]] Corresponding author. #author.at("affil-full", default: "") \
          ]
          _E-mail addresses:_ #authors.filter(a => a.at("email", default: none) != none).map(a => [#link("mailto:" + a.email)[#a.email.replace("@", "\\@")] (#a.name.split(" ").last())]).join(", ")
          ]
        ]
      ]
    },
    numbering: "1"
  )

  // Text setup
  set text(font: "CharisSIL-Regular", size: 10pt)
  set par(justify: true, leading: 0.65em)
  set heading(numbering: "1.")

  // Heading styles
  show heading.where(level: 1): it => {
    set text(size: 12pt, weight: "bold")
    block(above: 1.5em, below: 0.8em)[#it]
  }

  show heading.where(level: 2): it => {
    set text(size: 11pt, weight: "bold")
    block(above: 1.2em, below: 0.6em)[#it]
  }

  line(length: 85%, stroke: 0.1pt)
  grid(
  columns: (20%, 66%, 20%),
  gutter: 0em,
  row-gutter: 0pt,
  // Left column
  [
    #image("elsevier_logo_wide.png", width: 70%)
  ],
  // Middle column with background color
  box(
    fill: luma(245),
    inset: (left: 56pt, top: 5pt, bottom: 5pt, right: 56pt),          // Add padding so text doesn't touch edges
    radius: 0pt          // Optional: rounded corners
  )[
    #align(center)[
      #text("Contents lists available at ")
      #text(fill: blue)[ScienceDirect]
      #v(0.3cm)
      #text(size: 14pt, weight: "bold")[#journal]
      #v(0.5em)
      #link(journal-url)[#journal-url.split("//").at(1)]
    ]
  ],
  // Right column
  [
    #image("s_NA103569.jpg", width: 70%)
  ]
)

  // Journal header


  line(length: 100%, stroke: 2pt)
  v(1em)

  // Title
  align(left)[
    #text(size: 16pt, weight: "bold")[#title]
  ]

  v(1em)

  // Authors
  align(left)[
    #for (i, author) in authors.enumerate() {
      if i > 0 [, ]
        text(size: 12pt)[#author.name]
      if author.at("affils", default: ()).len() > 0 {
        text(fill:blue, size: 12pt)[#super(author.affils.join(","))]
      }
      if author.at("corr", default: false) {
        text(fill:blue, size: 12pt)[#super[⁎]]
      }
    }
  ]

  v(0.8em)

  // Affiliations
  set text(size: 9pt)
  for (key, value) in affiliations [
    #super[#key] #value \
  ]

  v(0.5em)

  set text(size: 10pt)
  v(0.5em)
  line(length: 100%, stroke: 0.5pt)

  // Article info box
  block(
    radius: 0pt,
    width: 100%,
  )[
    #grid(
      columns: (1fr, 2fr),
      gutter: 3em,
      [
        #text(size: 9pt, tracking: 0.3em)[
          #upper[#labelAinfo]
        ] \
        #line(length: 100%, stroke: 0.3pt)
        #text(size: 9pt)[_Keywords:_] \
        #for keyword in keywords [
          #text(size: 8pt)[#keyword] \
        ]
      ],
      [
        #text(size: 9pt, tracking: 0.3em)[
          #upper[#abstractLabel]
        ] \
        #line(length: 100%, stroke: 0.5pt)
        #text(size: 9pt)[#abstract]
      ]
    )
  ]

  // v(1em)
  line(length: 100%, stroke: 0.5pt)
  v(1em)

  // Body content
  body
}

// ============================================================
// EXAMPLE USAGE - Modify below for your article
// ============================================================

#show: elsevier-article.with(
  // Journal Information
  journal: "Ecological Genetics and Genomics",
  journal-url: "https://www.elsevier.com/locate/egg",
  doi: "10.1016/j.egg.2025.100411",
  pii: "S2405-9854(25)00090-4",

  // Dates
  received: "31 July 2025",
  revised: "16 September 2025",
  accepted: "30 September 2025",

  // Title
  title: "Your Article Title: Current Status, Challenges, and Applications",

  // Authors - add/modify as needed
  authors: (
    (
      name: "First Author",
      affils: (" a", "b"),
      corr: true,
      email: "first.author@university.edu",
      affil-full: "Department of Science, University Name, City, Country.",
    ),
    (
      name: "Second Author",
      affils: (" c",),
    ),
    (
      name: "Third Author",
      affils: (" d",),
    ),
    (
      name: "Fourth Author",
      affils: (" e",),
      corr: true,
      email: "fourth.author@university.edu",
      affil-full: "Department of Research, Another University, City, Country.",
      orcid: "0000-0000-0000-0000",
    ),
  ),

  // Affiliations
  affiliations: (
    a: "Department of Science, First University, City, State, 000000, Country",
    b: "School of Research, Second University, City, State, 000000, Country",
    c: "Department of Studies, Third University, City, State, 000000, Country",
    d: "National Institute, City, State, 000000, Country",
    e: "Department of Research, Another University, City, 000000, Country",
  ),

  // Abstract
  abstract: [
    #lorem(100)
  ],
  // Highlights (key points)
  highlights: (
    "First key finding or contribution of the research.",
    "Second important methodological advancement or discovery.",
    "Third significant result with practical implications.",
    "Fourth notable conclusion or future direction.",
  ),

  // Keywords
  keywords: ("Keyword1", "Keyword2", "Keyword3","Keyword4", "Keyword5"),
)

// ============================================================
// MAIN CONTENT - Two column layout
// ============================================================
#columns(2, gutter: 12pt)[

= Introduction

#lorem(300)

= Literature Review
#lorem(100)
== Previous Work
#lorem(100)

== Research Gap

#lorem(200)

= Materials and Methods
#lorem(1000)
== Study Design
#lorem(200)

== Data Collection
#lorem(200)

== Analysis
#lorem(200)

#figure(
  rect(width: 100%, height: 150pt, fill: luma(230))[
    #align(center + horizon)[Figure 1 placeholder: Add your figure here using #raw("#image(\"path/to/image.png\")")]
  ],
  caption: [Description of your figure. Explain what the figure shows and its relevance to your findings.],
) <fig1>

= Results
#lorem(200)
== Primary Findings
#lorem(200)
Present your main results here. Reference figures and tables as needed (see #text(fill: blue)[@fig1]).

== Secondary Findings
#lorem(200)
Present additional results and observations.

= Discussion
#lorem(200)
Discuss the implications of your findings in the context of existing literature.

== Interpretation
#lorem(200)
Explain what your results mean and how they advance the field.

== Limitations
#lorem(400)
Acknowledge the limitations of your study.

== Future Directions
#lorem(200)
Suggest directions for future research.

= Conclusions
#lorem(200)
Summarize your key findings and their significance. Restate the main contributions of your work.

= CRediT Authorship Contribution Statement

*First Author:* Writing – review & editing, Writing – original draft, Funding acquisition, Conceptualization. *Second Author:* Writing – review & editing, Writing – original draft. *Third Author:* Methodology, Investigation. *Fourth Author:* Writing – review & editing, Supervision, Funding acquisition, Conceptualization.

= Funding
#lorem(200)
This work was supported by [Funding Agency], [Country], under grant [Grant Number].

= Declaration of Competing Interest
#lorem(200)
The authors declare that they have no known competing financial interests or personal relationships that could have appeared to influence the work reported in this paper.

= Acknowledgments
#lorem(200)
The authors thank [acknowledgments for institutions, colleagues, technical support, etc.].

// ============================================================
// TABLES - Full width section
// ============================================================
// #set page(columns: 1)

#figure(
  rotate(360deg)[
  #table(
    columns: (auto, 1fr, 1fr, 1fr, 1fr),
    inset: 6pt,
    align: left,
    stroke: none,
    table.hline(),
    table.header(
      [*S. No*], [*Description*], [*Parameter 1*], [*Parameter 2*], [*Notes*]
    ),
    table.hline(),
    [1.], [Sample item one], [Value], [Unit], [Additional info],
    [2.], [Sample item two], [Value], [Unit], [Additional info],
    [3.], [Sample item three], [Value], [Unit], [Additional info],
    [4.], [Sample item four], [Value], [Unit], [Additional info],
    [5.], [Sample item five], [Value], [Unit], [Additional info],
    table.hline(),
  )],
  caption: [Your table caption describing the data presented.],
) <tbl1>


// #pagebreak()

// ============================================================
// REFERENCES
// ============================================================
#heading(numbering: none)[References]
#set text(size: 9pt)

#let refs = (
  bib1: "Author A, Author B (2024) Title of the first reference article. Journal Name 10:100-110.",
  bib2: "Author C, Author D, Author E (2023) Title of the second reference. Another Journal 5:50-60.",
  bib3: "Author F et al. (2022) Title of the third reference with multiple authors. Third Journal 15:200-215.",
  bib4: "Author G (2021) Book Title: Subtitle. Publisher Name, City.",
  bib5: "Author H, Author I (2020) Conference paper title. In: Proceedings of Conference Name, City, pp. 100-110.",
)
#for (i, (key, value)) in refs.pairs().enumerate() [
  [#{i + 1}] #value \
]

// Add more references as needed following the same pattern
]
