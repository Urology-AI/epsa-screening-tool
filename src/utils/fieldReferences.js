// Risk factor references for ePSA form fields.
// These are keyed so the Info modal can render translated descriptions + source links.
//
// Sources are intended to match the citations used in the original HTML prototype
// (e.g. values embedded in data-tooltip on ePSA-working.html).
const pubmedSearch = (term) => `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(term)}`;

const cancerGovProstatePreventionUrl = 'https://www.cancer.gov/types/prostate/patient/prostate-prevention-pdq';
const seerRiskUrl = 'https://training.seer.cancer.gov/prostate/intro/risk.html';

// Canonical references used by AUA/NCCN PSA screening guidelines.
// Surfaced on fields that AUA/NCCN actually use as screening criteria
// (age, race/ancestry, family history, germline mutations).
const auaScreeningGuideline = {
  name: 'AUA/SUO Early Detection of Prostate Cancer Guideline (Wei JT, et al. 2023)',
  url: 'https://www.auanet.org/guidelines-and-quality/guidelines/early-detection-of-prostate-cancer-guidelines',
};
const nccnScreeningGuideline = {
  name: 'NCCN Guidelines® — Prostate Cancer Early Detection',
  url: 'https://www.nccn.org/guidelines/guidelines-detail?category=2&id=1460',
};

export const fieldReferences = {
  age: {
    titleKey: 'part1.fields.age.title',
    descriptionKey: 'part1.fields.age.description',
    isGuideline: true,
    sources: [
      auaScreeningGuideline,
      nccnScreeningGuideline,
      { name: 'CDC', url: 'https://www.cdc.gov/prostate-cancer/risk-factors/index.html' },
      { name: 'Mayo Clinic', url: 'https://www.mayoclinic.org/diseases-conditions/prostate-cancer/symptoms-causes/syc-20353087' },
      { name: 'SEER Database', url: seerRiskUrl },
      { name: 'cancer.gov (NCI)', url: cancerGovProstatePreventionUrl },
      { name: 'Godtman RA, et al., Eur Urol. 2022', url: pubmedSearch('Godtman RA Eur Urol 2022') },
      { name: 'Nemesure B, et al., Res Rep Urol. 2022', url: pubmedSearch('Nemesure B Res Rep Urol 2022') },
    ],
  },
  race: {
    titleKey: 'part1.fields.race.title',
    descriptionKey: 'part1.fields.race.description',
    isGuideline: true,
    sources: [
      auaScreeningGuideline,
      nccnScreeningGuideline,
      { name: 'CDC', url: 'https://www.cdc.gov/prostate-cancer/risk-factors/index.html' },
      { name: 'ZERO Cancer', url: 'https://zerocancer.org/risk-factors' },
      { name: 'Tewari A., et al., Urol Onc. 2005', url: pubmedSearch('Tewari A Urol Onc 2005') },
      { name: 'Loeb S., et al., Urology 2006', url: pubmedSearch('Loeb S Urology 2006') },
      { name: 'Brawley O., World J Urol. 2012', url: pubmedSearch('Brawley O World J Urol 2012') },
    ],
  },
  familyHistory: {
    titleKey: 'part1.fields.familyHistory.title',
    descriptionKey: 'part1.fields.familyHistory.description',
    isGuideline: true,
    sources: [
      auaScreeningGuideline,
      nccnScreeningGuideline,
      { name: 'CDC', url: 'https://www.cdc.gov/prostate-cancer/risk-factors/index.html' },
      { name: 'Mayo Clinic', url: 'https://www.mayoclinic.org/diseases-conditions/prostate-cancer/symptoms-causes/syc-20353087' },
      { name: 'ZERO Cancer', url: 'https://zerocancer.org/risk-factors' },
      { name: 'Hemminki H, et al., Eur Urol Open Sci 2024', url: pubmedSearch('Hemminki H Eur Urol Open Sci 2024') },
      { name: 'Madersbacher S, et al., BJU Int. 2010', url: pubmedSearch('Madersbacher S BJU Int 2010') },
    ],
  },
  inflammationHistory: {
    titleKey: 'part1.fields.inflammationHistory.title',
    descriptionKey: 'part1.fields.inflammationHistory.description',
    isGuideline: false,
    sources: [{ name: 'PMC Study', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9955741/' }],
  },
  brcaStatus: {
    titleKey: 'part1.fields.brcaStatus.title',
    descriptionKey: 'part1.fields.brcaStatus.description',
    isGuideline: true,
    sources: [
      auaScreeningGuideline,
      nccnScreeningGuideline,
      { name: 'PMC Study', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9955741/' },
      { name: 'Mayo Clinic', url: 'https://www.mayoclinic.org/diseases-conditions/prostate-cancer/symptoms-causes/syc-20353087' },
      { name: 'Hemminki H, et al., Eur Urol Open Sci 2024', url: pubmedSearch('Hemminki H Eur Urol Open Sci 2024') },
      { name: 'Giri VN, et al., J Clin Oncol. 2018', url: pubmedSearch('Giri VN J Clin Oncol 2018') },
      { name: 'Nyberg T, et al., Br J Cancer. 2022 — BRCA1/2 meta-analysis', url: 'https://pubmed.ncbi.nlm.nih.gov/34963702/' },
      { name: 'Ewing CM, et al., N Engl J Med. 2012 — HOXB13 G84E', url: 'https://pubmed.ncbi.nlm.nih.gov/22236224/' },
      { name: 'Xu J, et al., Hum Genet. 2013 — HOXB13 susceptibility gene', url: 'https://pubmed.ncbi.nlm.nih.gov/23064873/' },
    ],
  },
  heightWeight: {
    titleKey: 'part1.fields.heightWeight.title',
    descriptionKey: 'part1.fields.heightWeight.description',
    isGuideline: false,
    sources: [
      { name: 'CDC', url: 'https://www.cdc.gov/prostate-cancer/risk-factors/index.html' },
      { name: 'KCUC', url: 'https://www.kcuc.com/know-your-prostate-cancer-risk-factors/' },
      { name: 'Zhu D, et al., Clin Genitourin Cancer 2022', url: pubmedSearch('Zhu D Clin Genitourin Cancer 2022') },
    ],
  },
  exercise: {
    titleKey: 'part1.fields.exercise.title',
    descriptionKey: 'part1.fields.exercise.description',
    isGuideline: false,
    sources: [
      { name: 'CDC', url: 'https://www.cdc.gov/prostate-cancer/risk-factors/index.html' },
      { name: 'ZERO Cancer', url: 'https://zerocancer.org/risk-factors' },
      { name: 'Rogers LQ, et al., BMC Public Health 2008', url: pubmedSearch('Rogers LQ BMC Public Health 2008') },
    ],
  },
  smoking: {
    titleKey: 'part1.fields.smoking.title',
    descriptionKey: 'part1.fields.smoking.description',
    isGuideline: false,
    sources: [
      { name: 'CDC', url: 'https://www.cdc.gov/prostate-cancer/risk-factors/index.html' },
      { name: 'KCUC', url: 'https://www.kcuc.com/know-your-prostate-cancer-risk-factors/' },
      { name: 'Plaskon LA, et al., Cancer Epidemiol Biomarkers Prev. 2003', url: pubmedSearch('Plaskon LA Cancer Epidemiol Biomarkers Prev 2003') },
    ],
  },
  chemicalExposure: {
    titleKey: 'part1.fields.chemicalExposure.title',
    descriptionKey: 'part1.fields.chemicalExposure.description',
    isGuideline: false,
    sources: [
      { name: 'CDC WTC Health Program – Toxins & Health Impacts', url: 'https://www.cdc.gov/wtc/exhibition/toxins-and-health-impacts.html' },
      { name: 'CDC', url: 'https://www.cdc.gov/prostate-cancer/risk-factors/index.html' },
      { name: 'KCUC', url: 'https://www.kcuc.com/know-your-prostate-cancer-risk-factors/' },
    ],
  },
  diet: {
    titleKey: 'part1.fields.diet.title',
    descriptionKey: 'part1.fields.diet.description',
    isGuideline: false,
    sources: [
      { name: 'Mayo Clinic', url: 'https://www.mayoclinic.org/diseases-conditions/prostate-cancer/symptoms-causes/syc-20353087' },
      { name: 'ZERO Cancer', url: 'https://zerocancer.org/risk-factors' },
      { name: 'Su ZT, et al., JAMA Oncol. 2024', url: pubmedSearch('Su ZT JAMA Oncol 2024') },
      { name: 'Andersson SO, et al., Int J Cancer. 1996', url: pubmedSearch('Andersson SO Int J Cancer 1996') },
    ],
  },
  ipss: {
    titleKey: 'part1.fields.ipss.title',
    descriptionKey: 'part1.fields.ipss.description',
    isGuideline: false,
    sources: [
      { name: 'Mayo Clinic', url: 'https://www.mayoclinic.org/diseases-conditions/prostate-cancer/symptoms-causes/syc-20353087' },
      { name: 'van Leeuwen, PJ, et al., Can J Urol. 2011', url: pubmedSearch('van Leeuwen PJ Can J Urol 2011') },
    ],
  },
  shim: {
    titleKey: 'part1.fields.shim.title',
    descriptionKey: 'part1.fields.shim.description',
    isGuideline: false,
    sources: [
      { name: 'Mayo Clinic', url: 'https://www.mayoclinic.org/diseases-conditions/prostate-cancer/symptoms-causes/syc-20353087' },
    ],
  },
  comorbidities: {
    titleKey: 'part1.fields.comorbidities.title',
    descriptionKey: 'part1.fields.comorbidities.description',
    isGuideline: false,
    sources: [
      { name: 'Tiruye et al. (2024) – Impact of comorbidities on prostate cancer-specific mortality', url: 'https://pubmed.ncbi.nlm.nih.gov/38798040/' },
      { name: 'Blanc-Lapierre A, et al., BMC Public Health 2015', url: pubmedSearch('Blanc-Lapierre A BMC Public Health 2015') },
      { name: 'Zhu D, et al., Clin Genitourin Cancer 2022', url: pubmedSearch('Zhu D Clin Genitourin Cancer 2022') },
    ],
  },
  // Active Surveillance pathway — biopsy and AS decision support sources.
  activeSurveillance: {
    sources: [
      {
        name: 'Eastham JA, et al. AUA/ASTRO Guideline Part I — J Urol. 2022;208(1):10–18',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Eastham+AUA+ASTRO+guideline+part+I+J+Urol+2022',
      },
      {
        name: 'Eastham JA, et al. AUA/ASTRO Guideline Part II (Active Surveillance) — J Urol. 2022;208(1):19–25',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Eastham+AUA+ASTRO+guideline+part+II+J+Urol+2022',
      },
      {
        name: 'Schaeffer EM, et al. NCCN Guidelines® Insights: Prostate Cancer, Version 3.2024 — PMID 38626801',
        url: 'https://pubmed.ncbi.nlm.nih.gov/38626801/',
      },
      {
        name: 'Cornford P, et al. EAU Guidelines on Prostate Cancer — 2024 Update. Eur Urol. 2024;86(2):148–163',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Cornford+EAU+prostate+cancer+guidelines+2024',
      },
    ],
  },
  // Part 2 evidence sources used for PSAD/PSA/MRI tooltips/modals.
  part2: {
    psaLevel: {
      sources: [
        {
          name: 'Loeb S., et al., Urology 2006',
          url: pubmedSearch('Loeb S Urology 2006'),
        },
        {
          name: 'AUA/SUO Screening Guidelines 2023',
          url: pubmedSearch('AUA SUO screening guidelines 2023'),
        },
      ],
    },
    pirads: {
      titleKey: 'part2.piradsInfo.title',
      descriptionKey: 'part2.piradsInfo.description',
      sources: [
        {
          name: 'Park KJ., et al., J Urol. 2020',
          url: pubmedSearch('Park KJ J Urol 2020'),
        },
        {
          name: 'Oerther B., et al., Prostate Cancer 2021',
          url: pubmedSearch('Oerther B Prostate Cancer 2021'),
        },
      ],
    },
    psadKadeer: {
      sources: [
        {
          name: 'Frontiers in Oncology (Kadeer et al., 2025)',
          url: 'https://www.frontiersin.org/journals/oncology/articles/10.3389/fonc.2025.1602134/full',
        },
        {
          name: 'Pedraza et al. (2023) — Eur Urol Open Sci (source ref)',
          url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Pedraza+2023+%22European+Urology+Open+Science%22+72-81+48',
        },
      ],
    },
  },
};

export default fieldReferences;
