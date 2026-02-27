// BBC World Service Configuration
// Organized by region with language services

export const REGIONS = {
  Africa: [
    { name: "Gahuza", url: "https://www.bbc.com/gahuza" },
    { name: "Hausa", url: "https://www.bbc.com/hausa" },
    { name: "Igbo", url: "https://www.bbc.com/igbo" },
    { name: "Pidgin", url: "https://www.bbc.com/pidgin" },
    { name: "Somali", url: "https://www.bbc.com/somali" },
    { name: "Swahili", url: "https://www.bbc.com/swahili" },
    { name: "Tigrinya", url: "https://www.bbc.com/tigrinya" },
    { name: "Yoruba", url: "https://www.bbc.com/africa" },
  ],
  "Asia (Central)": [
    { name: "Azeri", url: "https://www.bbc.com/azeri" },
    { name: "Kyrgyz", url: "https://www.bbc.com/kyrgyz" },
    { name: "Uzbek", url: "https://www.bbc.com/uzbek" },
  ],
  "Asia (East)": [
    { name: "Burmese", url: "https://www.bbc.com/burmese" },
    { name: "Indonesia", url: "https://www.bbc.com/indonesia" },
    { name: "Japanese", url: "https://www.bbc.com/japanese" },
    { name: "Korean", url: "https://www.bbc.com/korean" },
    { name: "Thai", url: "https://www.bbc.com/thai" },
    { name: "Vietnamese", url: "https://www.bbc.com/vietnamese" },
    { name: "Zhongwen", url: "https://www.bbc.com/zhongwen" },
  ],
  "Asia (South)": [
    { name: "Bengali", url: "https://www.bbc.com/bengali" },
    { name: "Dari", url: "https://www.bbc.com/dari" },
    { name: "Gujarati", url: "https://www.bbc.com/gujarati" },
    { name: "Hindi", url: "https://www.bbc.com/hindi" },
    { name: "Marathi", url: "https://www.bbc.com/marathi" },
    { name: "Nepali", url: "https://www.bbc.com/nepali" },
    { name: "Pashto", url: "https://www.bbc.com/pashto" },
    { name: "Punjabi", url: "https://www.bbc.com/punjabi" },
    { name: "Sinhala", url: "https://www.bbc.com/sinhala" },
    { name: "Tamil", url: "https://www.bbc.com/tamil" },
    { name: "Telugu", url: "https://www.bbc.com/telugu" },
    { name: "Urdu", url: "https://www.bbc.com/urdu" },
  ],
  Europe: [
    { name: "Hungarian", url: "https://www.bbc.com/magyarul" },
    { name: "Polish", url: "https://www.bbc.com/polish" },
    { name: "Romania", url: "https://www.bbc.com/romania" },
    { name: "Russian", url: "https://www.bbc.com/russian" },
    { name: "Serbian", url: "https://www.bbc.com/serbian/lat" },

    { name: "Ukrainian", url: "https://www.bbc.com/ukrainian" },
  ],
  "Latin America": [
    { name: "Brasil", url: "https://www.bbc.com/brasil" },
    { name: "Mundo", url: "https://www.bbc.com/mundo" },
  ],
  "Middle East": [
    { name: "Arabic", url: "https://www.bbc.com/arabic" },
    { name: "Persian", url: "https://www.bbc.com/persian" },
    { name: "Turkce", url: "https://www.bbc.com/turkce" },
  ],
};

export const getRegionNames = () => Object.keys(REGIONS);

export const getServicesByRegion = (region) => REGIONS[region] || [];
