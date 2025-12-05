// Typst Document Templates

export const templates = [
  {
    id: "blank",
    name: "Blank",
    icon: "📄",
    description: "Start with a blank document",
    content: `= My Document

Start writing here...
`,
  },
  {
    id: "article",
    name: "Article",
    icon: "📰",
    description: "Academic article template",
    content: `#set document(title: "Article Title", author: "Your Name")
#set page(paper: "a4", margin: 2cm)
#set text(font: "New Computer Modern", size: 11pt)
#set heading(numbering: "1.1")
#set par(justify: true)

#align(center)[
  #text(size: 18pt, weight: "bold")[Article Title]
  
  #text(size: 12pt)[Your Name]
  
  #text(size: 10pt, style: "italic")[your.email\\@example.com]
  
  #v(1em)
  
  #text(size: 10pt)[#datetime.today().display("[month repr:long] [day], [year]")]
]

#v(2em)

#text(weight: "bold")[Abstract:]
#lorem(50)

#v(1em)

= Introduction
#lorem(100)

= Methods
#lorem(80)

== Data Collection
#lorem(60)

== Analysis
#lorem(60)

= Results
#lorem(100)

= Discussion
#lorem(100)

= Conclusion
#lorem(50)

= References
// Add your references here
`,
  },
  {
    id: "letter",
    name: "Letter",
    icon: "✉️",
    description: "Formal letter template",
    content: `#set page(paper: "a4", margin: (x: 2.5cm, y: 3cm))
#set text(font: "New Computer Modern", size: 11pt)
#set par(justify: true)

#align(right)[
  Your Name \\
  Your Address \\
  City, State ZIP \\
  #v(0.5em)
  #datetime.today().display("[month repr:long] [day], [year]")
]

#v(2em)

Recipient Name \\
Company Name \\
Address \\
City, State ZIP

#v(1.5em)

Dear Recipient,

#v(0.5em)

#lorem(50)

#lorem(50)

#lorem(30)

#v(1em)

Sincerely,

#v(3em)

Your Name
`,
  },
  {
    id: "resume",
    name: "Resume/CV",
    icon: "📋",
    description: "Professional resume template",
    content: `#set page(paper: "a4", margin: (x: 1.5cm, y: 2cm))
#set text(font: "New Computer Modern", size: 10pt)

#show heading.where(level: 1): it => [
  #set text(size: 14pt, weight: "bold")
  #block(above: 1em, below: 0.5em)[#it.body]
  #line(length: 100%, stroke: 0.5pt)
]

#show heading.where(level: 2): it => [
  #set text(size: 11pt, weight: "bold")
  #block(above: 0.8em, below: 0.3em)[#it.body]
]

#align(center)[
  #text(size: 24pt, weight: "bold")[Your Name]
  
  #v(0.3em)
  
  your.email\\@email.com | +1 (123) 456-7890 | City, State \\
  linkedin.com/in/yourprofile | github.com/yourusername
]

= Summary
A brief professional summary highlighting your key skills and experience. #lorem(30)

= Experience

== Job Title | Company Name #h(1fr) _Start Date -- End Date_
- Accomplished X by doing Y, resulting in Z
- Led team of N people to achieve specific goal
- Improved process/metric by X%

== Previous Job Title | Previous Company #h(1fr) _Start Date -- End Date_
- Key achievement or responsibility
- Another significant accomplishment
- Relevant project or initiative

= Education

== Degree Name | University Name #h(1fr) _Graduation Year_
- Relevant coursework, honors, or activities
- GPA: X.XX (if notable)

= Skills

*Technical:* Skill 1, Skill 2, Skill 3, Skill 4, Skill 5

*Languages:* English (Native), Spanish (Conversational)

*Tools:* Tool 1, Tool 2, Tool 3

= Projects

== Project Name #h(1fr) _Date_
Brief description of the project and your role. Technologies used.
`,
  },
  {
    id: "report",
    name: "Report",
    icon: "📊",
    description: "Business or academic report",
    content: `#set document(title: "Report Title", author: "Your Name")
#set page(paper: "a4", margin: 2cm, numbering: "1")
#set text(font: "New Computer Modern", size: 11pt)
#set heading(numbering: "1.1")
#set par(justify: true)

// Title page
#page(numbering: none)[
  #align(center + horizon)[
    #text(size: 24pt, weight: "bold")[Report Title]
    
    #v(2em)
    
    #text(size: 14pt)[Subtitle or Description]
    
    #v(4em)
    
    #text(size: 12pt)[
      Prepared by: Your Name \\
      Organization/Department \\
      #v(1em)
      #datetime.today().display("[month repr:long] [day], [year]")
    ]
  ]
]

// Table of contents
#outline(title: "Table of Contents", indent: auto)
#pagebreak()

= Executive Summary
#lorem(80)

= Introduction
#lorem(100)

== Background
#lorem(60)

== Objectives
- Objective 1
- Objective 2
- Objective 3

= Methodology
#lorem(80)

= Findings

== Key Finding 1
#lorem(60)

== Key Finding 2
#lorem(60)

#figure(
  table(
    columns: 3,
    [*Item*], [*Value*], [*Change*],
    [Item A], [100], [+5%],
    [Item B], [200], [+10%],
    [Item C], [150], [-3%],
  ),
  caption: [Sample data table]
)

= Recommendations
+ First recommendation with explanation
+ Second recommendation with explanation
+ Third recommendation with explanation

= Conclusion
#lorem(60)

= Appendix
Additional supporting information and data.
`,
  },
  {
    id: "presentation",
    name: "Slides",
    icon: "🎯",
    description: "Presentation slides",
    content: `// Simple slide presentation without external packages
#set page(
  paper: "presentation-16-9",
  margin: (x: 2cm, y: 1.5cm),
)
#set text(font: "New Computer Modern", size: 20pt)

// Slide 1: Title
#page[
  #align(center + horizon)[
    #text(size: 40pt, weight: "bold")[Presentation Title]
    
    #v(1em)
    
    #text(size: 24pt)[Your Name]
    
    #text(size: 18pt)[#datetime.today().display("[month repr:long] [day], [year]")]
  ]
]

// Slide 2: Agenda
#page[
  #text(size: 32pt, weight: "bold")[Agenda]
  
  #v(1em)
  
  + Introduction
  + Main Topic 1
  + Main Topic 2
  + Conclusion
  + Q&A
]

// Slide 3: Introduction
#page[
  #text(size: 32pt, weight: "bold")[Introduction]
  
  #v(0.5em)
  
  - First point about the topic
  - Second important point
  - Third key insight
  
  #v(1em)
  
  #align(center)[
    _"A relevant quote or key message"_
  ]
]

// Slide 4: Main Topic 1
#page[
  #text(size: 32pt, weight: "bold")[Main Topic 1]
  
  #v(0.5em)
  
  *Key Points*
  
  - Point A with supporting detail
  - Point B with evidence
  - Point C with example
]

// Slide 5: Main Topic 2
#page[
  #text(size: 32pt, weight: "bold")[Main Topic 2]
  
  #v(0.5em)
  
  #grid(
    columns: 2,
    gutter: 2em,
    [
      *Left Column*
      - Item 1
      - Item 2
      - Item 3
    ],
    [
      *Right Column*
      - Item A
      - Item B
      - Item C
    ]
  )
]

// Slide 6: Conclusion
#page[
  #text(size: 32pt, weight: "bold")[Conclusion]
  
  #v(0.5em)
  
  *Key Takeaways*
  
  + First major conclusion
  + Second important point
  + Call to action
  
  #v(2em)
  
  #align(center)[
    *Thank you!*
    
    Questions?
  ]
]
`,
  },
  {
    id: "math",
    name: "Math Notes",
    icon: "🔢",
    description: "Mathematics document with equations",
    content: `#set document(title: "Math Notes")
#set page(paper: "a4", margin: 2cm)
#set text(font: "New Computer Modern", size: 11pt)
#set heading(numbering: "1.1")
#set math.equation(numbering: "(1)")

= Mathematical Notes

== Calculus

The derivative of a function $f(x)$ is defined as:

$ f'(x) = lim_(h -> 0) (f(x + h) - f(x)) / h $

=== Common Derivatives

- $d/(d x) x^n = n x^(n-1)$
- $d/(d x) e^x = e^x$
- $d/(d x) ln(x) = 1/x$
- $d/(d x) sin(x) = cos(x)$

=== Integration

The definite integral:

$ integral_a^b f(x) d x = F(b) - F(a) $

where $F(x)$ is the antiderivative of $f(x)$.

== Linear Algebra

=== Matrix Operations

Let $A$ and $B$ be matrices:

$ A = mat(a, b; c, d), quad B = mat(e, f; g, h) $

Matrix multiplication:

$ A B = mat(a e + b g, a f + b h; c e + d g, c f + d h) $

=== Eigenvalues

For a matrix $A$, eigenvalues $lambda$ satisfy:

$ det(A - lambda I) = 0 $

== Probability

=== Bayes' Theorem

$ P(A | B) = (P(B | A) P(A)) / P(B) $

=== Normal Distribution

The probability density function:

$ f(x) = 1/(sigma sqrt(2 pi)) e^(-1/2 ((x - mu)/sigma)^2) $

where $mu$ is the mean and $sigma$ is the standard deviation.
`,
  },
  {
    id: "thesis",
    name: "Thesis",
    icon: "🎓",
    description: "Academic thesis template",
    content: `#set document(title: "Thesis Title", author: "Your Name")
#set page(paper: "a4", margin: (inside: 3.5cm, outside: 2.5cm, y: 2.5cm))
#set text(font: "New Computer Modern", size: 12pt)
#set par(justify: true, leading: 1.5em)
#set heading(numbering: "1.1")

// Title page
#page(numbering: none)[
  #align(center)[
    #v(3cm)
    
    #image("university-logo.png", width: 4cm) // Add your logo
    
    #v(2cm)
    
    #text(size: 14pt)[UNIVERSITY NAME]
    
    #text(size: 12pt)[Department of Your Field]
    
    #v(3cm)
    
    #text(size: 20pt, weight: "bold")[
      Your Thesis Title Goes Here: \\
      A Subtitle if Needed
    ]
    
    #v(3cm)
    
    #text(size: 14pt)[
      A thesis submitted for the degree of \\
      Master of Science / Doctor of Philosophy
    ]
    
    #v(2cm)
    
    #text(size: 14pt)[Your Full Name]
    
    #v(1cm)
    
    #text(size: 12pt)[#datetime.today().display("[month repr:long] [year]")]
  ]
]

// Abstract
#page(numbering: none)[
  #align(center)[
    #text(size: 14pt, weight: "bold")[Abstract]
  ]
  
  #v(1em)
  
  #lorem(150)
  
  #v(2em)
  
  *Keywords:* keyword1, keyword2, keyword3, keyword4, keyword5
]

// Acknowledgments
#page(numbering: none)[
  #align(center)[
    #text(size: 14pt, weight: "bold")[Acknowledgments]
  ]
  
  #v(1em)
  
  I would like to express my gratitude to...
  
  #lorem(80)
]

// Table of contents
#outline(title: "Contents", indent: auto)
#pagebreak()

#set page(numbering: "1")
#counter(page).update(1)

= Introduction

== Background
#lorem(100)

== Research Questions
+ What is the first research question?
+ What is the second research question?
+ What is the third research question?

== Thesis Structure
This thesis is organized as follows...

= Literature Review

== Previous Work
#lorem(100)

== Theoretical Framework
#lorem(80)

= Methodology

== Research Design
#lorem(80)

== Data Collection
#lorem(60)

== Analysis Methods
#lorem(60)

= Results

== Finding 1
#lorem(80)

== Finding 2
#lorem(80)

= Discussion

== Interpretation of Results
#lorem(100)

== Limitations
#lorem(60)

== Future Work
#lorem(60)

= Conclusion
#lorem(80)

// Bibliography
#pagebreak()
#bibliography("references.bib", style: "ieee")
`,
  },
];

// Get template by ID
export function getTemplate(id) {
  return templates.find((t) => t.id === id);
}

// Get all template metadata (without content for menu display)
export function getTemplateList() {
  return templates.map(({ id, name, icon, description }) => ({
    id,
    name,
    icon,
    description,
  }));
}
