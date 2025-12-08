// ============================================================
// ELSEVIER JOURNAL ARTICLE TEMPLATE (Embedded)
// ============================================================

#let elsevier-article(
  journal: "Journal Name",
  journal-url: "https://www.elsevier.com/locate/journal",
  doi: "10.1016/j.xxx.2025.xxxxxx",
  pii: "S0000-0000(00)00000-0",
  received: "DD Month YYYY",
  revised: "DD Month YYYY", 
  accepted: "DD Month YYYY",
  title: "Article Title",
  authors: (),
  affiliations: (:),
  abstract: [],
  highlights: (),
  keywords: "",
  body,
) = {
  set document(title: title, author: authors.map(a => a.name))
  
  set page(
    paper: "a4",
    margin: (x: 2.5cm, y: 2.5cm),
    header: context {
      if counter(page).get().first() > 1 [
        #set text(size: 9pt)
        #authors.first().name.split(" ").last() et al. #h(1fr) #journal
      ]
    },
    numbering: "1",
  )
  
  set text(font: "New Computer Modern", size: 10pt)
  set par(justify: true, leading: 0.65em)
  set heading(numbering: "1.")
  
  show heading.where(level: 1): it => {
    set text(size: 12pt, weight: "bold")
    block(above: 1.5em, below: 0.8em)[#it]
  }
  
  show heading.where(level: 2): it => {
    set text(size: 11pt, weight: "bold")
    block(above: 1.2em, below: 0.6em)[#it]
  }
  
  align(center)[
    #text(size: 14pt, weight: "bold")[#journal]
    #v(0.3em)
    #link(journal-url)[#journal-url.split("//").at(1)]
  ]
  
  v(1em)
  
  align(center)[
    #text(size: 16pt, weight: "bold")[#title]
  ]
  
  v(1em)
  
  align(center)[
    #for (i, author) in authors.enumerate() {
      if i > 0 [, ]
      author.name
      if author.at("affils", default: ()).len() > 0 {
        super(author.affils.join(","))
      }
      if author.at("corr", default: false) [#super[⁎]]
    }
  ]
  
  v(0.8em)
  
  set text(size: 9pt)
  for (key, value) in affiliations [
    #super[#key] #value \
  ]
  
  v(0.5em)
  
  text(size: 8pt)[
    #let corr-authors = authors.filter(a => a.at("corr", default: false))
    #for (i, author) in corr-authors.enumerate() [
      #if i == 0 [#super[⁎]] else [#super[⁎⁎]] Corresponding author. #author.at("affil-full", default: "") \
    ]
    _E-mail addresses:_ #authors.filter(a => a.at("email", default: none) != none).map(a => [#link("mailto:" + a.email)[#a.email.replace("@", "\\@")] (#a.name.split(" ").last())]).join(", ")
  ]
  
  set text(size: 10pt)
  v(0.5em)
  line(length: 100%, stroke: 0.5pt)
  
  block(fill: luma(245), inset: 10pt, radius: 4pt, width: 100%)[
    #grid(
      columns: (1fr, 2fr),
      gutter: 1em,
      [
        #text(weight: "bold")[Article info] \
        #text(size: 9pt)[
          _Received_ #received \
          _Revised_ #revised \
          _Accepted_ #accepted
        ]
      ],
      [
        #text(weight: "bold")[Abstract] \
        #text(size: 9pt)[#abstract]
      ]
    )
  ]
  
  v(0.5em)
  
  if highlights.len() > 0 {
    block(stroke: (left: 3pt + rgb("#0066cc")), inset: (left: 10pt, y: 8pt))[
      #text(weight: "bold")[Highlights]
      #for highlight in highlights [
        - #highlight
      ]
    ]
    v(0.5em)
  }
  
  [#text(weight: "bold")[Keywords:] #keywords]
  
  v(1em)
  line(length: 100%, stroke: 0.5pt)
  v(1em)
  
  body
}

// ============================================================
// ARTICLE: Machine Learning in Healthcare
// ============================================================
#show: elsevier-article.with(
  journal: "Artificial Intelligence in Medicine",
  journal-url: "https://www.elsevier.com/locate/aiim",
  doi: "10.1016/j.aiim.2025.102847",
  pii: "S0933-3657(25)00123-5",
  
  received: "15 August 2025",
  revised: "28 October 2025",
  accepted: "12 November 2025",
  
  title: "Deep Learning Approaches for Early Detection of Cardiovascular Diseases: A Comprehensive Review",
  
  authors: (
    (
      name: "Sarah Chen",
      affils: ("a",),
      corr: true,
      email: "s.chen@stanford.edu",
      affil-full: "Department of Computer Science, Stanford University, Stanford, CA 94305, USA.",
    ),
    (
      name: "Michael Roberts",
      affils: ("b",),
    ),
    (
      name: "Elena Petrova",
      affils: ("a", "c"),
    ),
    (
      name: "James Wilson",
      affils: ("b",),
      corr: true,
      email: "j.wilson@mit.edu",
      affil-full: "MIT Computer Science and Artificial Intelligence Laboratory, Cambridge, MA 02139, USA.",
    ),
  ),
  
  affiliations: (
    a: "Department of Computer Science, Stanford University, Stanford, CA 94305, USA",
    b: "MIT Computer Science and Artificial Intelligence Laboratory, Cambridge, MA 02139, USA",
    c: "Department of Cardiology, Massachusetts General Hospital, Boston, MA 02114, USA",
  ),
  
  abstract: [
    Cardiovascular diseases (CVDs) remain the leading cause of mortality worldwide, accounting for approximately 17.9 million deaths annually. Early detection and accurate diagnosis are crucial for effective treatment and improved patient outcomes. This comprehensive review examines recent advances in deep learning approaches for early CVD detection, analyzing over 150 studies published between 2020 and 2025. We categorize these approaches into four main areas: electrocardiogram (ECG) analysis, medical imaging interpretation, multimodal data fusion, and wearable device integration. Our analysis reveals that convolutional neural networks (CNNs) and transformer-based architectures achieve the highest accuracy rates, with some models exceeding 95% sensitivity in detecting arrhythmias and structural abnormalities. We also identify key challenges including data privacy concerns, model interpretability, and clinical validation requirements. Finally, we propose future research directions focusing on federated learning, explainable AI, and real-time monitoring systems.
  ],
  
  highlights: (
    "Comprehensive review of 150+ deep learning studies for cardiovascular disease detection.",
    "CNNs and transformer architectures achieve >95% sensitivity in arrhythmia detection.",
    "Multimodal data fusion significantly improves diagnostic accuracy over single-source models.",
    "Identified key challenges: data privacy, interpretability, and clinical validation.",
    "Proposed roadmap for federated learning and explainable AI in clinical settings.",
  ),
  
  keywords: "Deep learning; Cardiovascular disease; ECG analysis; Medical imaging; Artificial intelligence; Clinical decision support",
)

// ============================================================
// MAIN CONTENT
// ============================================================
#columns(2, gutter: 12pt)[

= Introduction

Cardiovascular diseases (CVDs) represent the most significant global health challenge of our time, causing an estimated 17.9 million deaths annually according to the World Health Organization [1]. Despite advances in treatment modalities, the fundamental challenge of early detection remains paramount. Delayed diagnosis often results in disease progression beyond the point where intervention can be most effective.

The emergence of artificial intelligence (AI), particularly deep learning, has opened new avenues for automated CVD detection. Deep learning models can analyze complex patterns in medical data that may be imperceptible to human observers, potentially enabling earlier and more accurate diagnoses [2]. The proliferation of electronic health records (EHRs), medical imaging databases, and wearable health devices has created unprecedented opportunities for training and deploying these models.

This review aims to provide a comprehensive analysis of deep learning approaches for early CVD detection. We examine the current state of the art, identify successful methodologies, and discuss the challenges that must be overcome for widespread clinical adoption. Our analysis covers four primary domains: electrocardiogram (ECG) analysis, medical imaging interpretation, multimodal data fusion, and wearable device integration.

= Background

== Cardiovascular Disease Burden

The global burden of CVDs continues to grow, driven by aging populations, lifestyle factors, and the increasing prevalence of risk factors such as hypertension, diabetes, and obesity [3]. In the United States alone, approximately 695,000 people die from heart disease annually, representing one in every five deaths [4].

== Traditional Diagnostic Approaches

Conventional CVD diagnosis relies on a combination of clinical assessment, laboratory tests, and imaging studies. While effective, these approaches have limitations including:

- Dependence on specialist expertise and availability
- Significant time delays between symptom onset and diagnosis
- Variability in interpretation among clinicians
- High costs associated with comprehensive cardiac evaluation

== Deep Learning Fundamentals

Deep learning, a subset of machine learning, utilizes artificial neural networks with multiple layers to learn hierarchical representations of data [5]. Key architectures relevant to CVD detection include convolutional neural networks (CNNs), recurrent neural networks (RNNs), and more recently, transformer models.

= Methods

== Literature Search Strategy

We conducted a systematic review following PRISMA guidelines. Databases searched included PubMed, IEEE Xplore, and Google Scholar, covering publications from January 2020 to October 2025. Search terms included combinations of "deep learning," "cardiovascular disease," "ECG," "cardiac imaging," and "arrhythmia detection."

== Inclusion Criteria

Studies were included if they: (1) utilized deep learning methods, (2) focused on CVD detection or diagnosis, (3) reported quantitative performance metrics, and (4) were published in peer-reviewed venues.

= Results

== ECG Analysis

ECG-based deep learning models have demonstrated remarkable success in detecting various cardiac abnormalities. Table 1 summarizes key findings from leading studies.

#figure(
  rect(width: 100%, height: 100pt, fill: luma(230))[
    #align(center + horizon)[Figure 1: Overview of deep learning architectures for ECG analysis]
  ],
  caption: [Schematic representation of CNN and transformer architectures commonly used for ECG signal processing and arrhythmia detection.],
) <fig1>

Hannun et al. [6] developed a 34-layer CNN that achieved cardiologist-level performance in detecting 12 rhythm classes from single-lead ECGs. Their model demonstrated 97.4% sensitivity and 96.2% specificity on an independent test set comprising over 300,000 patients.

== Medical Imaging

Deep learning has shown transformative potential in analyzing cardiac imaging modalities including echocardiography, cardiac MRI, and CT angiography. Studies have reported automated detection of:

- Left ventricular dysfunction with AUC > 0.94
- Coronary artery disease with sensitivity > 90%
- Structural abnormalities including valve disease

== Multimodal Approaches

Recent research has focused on integrating multiple data sources to improve diagnostic accuracy. Combined ECG and imaging analysis has shown significant improvements over single-modality approaches, with some studies reporting 15-20% gains in overall accuracy [7].

== Wearable Device Integration

The proliferation of consumer wearables capable of recording ECG and photoplethysmography (PPG) signals has enabled continuous cardiac monitoring (see @fig1). Studies have validated deep learning models for detecting atrial fibrillation from Apple Watch and similar devices with sensitivities exceeding 95% [8].

= Discussion

== Clinical Implications

The translation of deep learning models to clinical practice requires addressing several key challenges:

*Interpretability:* Clinical adoption necessitates explainable AI (XAI) approaches that provide insights into model decision-making. Black-box models face significant resistance from clinicians and regulatory bodies.

*Validation:* Prospective clinical trials are essential to demonstrate real-world effectiveness beyond retrospective performance metrics.

*Integration:* Seamless integration with existing clinical workflows and EHR systems is crucial for practical deployment.

== Limitations

Our review has several limitations. Publication bias may favor positive results, and the heterogeneity of study designs complicates direct comparisons. Additionally, many studies rely on retrospective data, which may not reflect real-world performance.

== Future Directions

We identify three key areas for future research:

+ *Federated Learning:* Enabling model training across institutions while preserving patient privacy
+ *Explainable AI:* Developing interpretable models that provide clinically meaningful explanations
+ *Real-time Monitoring:* Creating systems for continuous risk assessment using wearable devices

= Conclusions

Deep learning approaches have demonstrated significant potential for early detection of cardiovascular diseases. CNN and transformer architectures have achieved performance levels comparable to or exceeding human experts in specific tasks. However, challenges related to interpretability, clinical validation, and workflow integration must be addressed before widespread adoption.

The path forward requires collaboration between AI researchers, clinicians, and regulatory bodies to establish appropriate frameworks for development, validation, and deployment. With continued progress, deep learning-based CVD detection has the potential to save millions of lives through earlier intervention and improved patient outcomes.

= CRediT Authorship Contribution Statement

*Sarah Chen:* Conceptualization, Methodology, Writing – original draft, Supervision. *Michael Roberts:* Data curation, Formal analysis, Writing – review & editing. *Elena Petrova:* Investigation, Validation, Writing – review & editing. *James Wilson:* Conceptualization, Funding acquisition, Writing – review & editing, Supervision.

= Funding

This work was supported by the National Institutes of Health (Grant R01-HL-156789) and the American Heart Association (Grant 24SFRN-001).

= Declaration of Competing Interest

The authors declare that they have no known competing financial interests or personal relationships that could have appeared to influence the work reported in this paper.

= Acknowledgments

The authors thank the Stanford Cardiovascular Institute and MIT CSAIL for computational resources and support.

]

// ============================================================
// TABLES
// ============================================================
#set page(columns: 1)

#figure(
  table(
    columns: (auto, 1.5fr, 1fr, 1fr, 1fr),
    inset: 6pt,
    align: left,
    stroke: none,
    table.hline(),
    table.header(
      [*Study*], [*Architecture*], [*Dataset Size*], [*Sensitivity*], [*Specificity*]
    ),
    table.hline(),
    [Hannun et al. (2019)], [34-layer CNN], [91,232 ECGs], [97.4%], [96.2%],
    [Attia et al. (2019)], [CNN], [180,922 ECGs], [93.8%], [90.2%],
    [Ribeiro et al. (2020)], [ResNet], [2.3M ECGs], [95.1%], [94.3%],
    [Chen et al. (2024)], [Transformer], [500,000 ECGs], [98.2%], [97.8%],
    [This review], [Various], [>5M ECGs], [95.2% (avg)], [94.1% (avg)],
    table.hline(),
  ),
  caption: [Performance comparison of deep learning models for ECG-based arrhythmia detection.],
) <tbl1>

#pagebreak()

// ============================================================
// REFERENCES
// ============================================================
#heading(numbering: none)[References]
#set text(size: 9pt)
#columns(2, gutter: 12pt)[

#let refs = (
  bib1: "World Health Organization (2023) Cardiovascular diseases (CVDs) fact sheet. WHO, Geneva.",
  bib2: "Topol EJ (2019) High-performance medicine: the convergence of human and artificial intelligence. Nat Med 25:44-56.",
  bib3: "Roth GA et al. (2020) Global burden of cardiovascular diseases and risk factors, 1990-2019. J Am Coll Cardiol 76:2982-3021.",
  bib4: "Centers for Disease Control and Prevention (2024) Heart disease facts. CDC, Atlanta.",
  bib5: "LeCun Y, Bengio Y, Hinton G (2015) Deep learning. Nature 521:436-444.",
  bib6: "Hannun AY et al. (2019) Cardiologist-level arrhythmia detection and classification in ambulatory electrocardiograms using a deep neural network. Nat Med 25:65-69.",
  bib7: "Johnson KW et al. (2024) Multimodal deep learning for cardiovascular risk prediction. Lancet Digit Health 6:e123-e134.",
  bib8: "Perez MV et al. (2019) Large-scale assessment of a smartwatch to identify atrial fibrillation. N Engl J Med 381:1909-1917.",
)

#for (i, (key, value)) in refs.pairs().enumerate() [
  [#{i + 1}] #value \
]

]

