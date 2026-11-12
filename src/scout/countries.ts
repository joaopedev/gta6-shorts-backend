export type Region = 'asia' | 'europe';
export type Country = {
  code: string;
  name: string;
  region: Region;
  searchLabel: string;
};

export const COUNTRIES: Country[] = [
  { code: 'JP', name: 'Japão', region: 'asia', searchLabel: 'Japan' },
  { code: 'KR', name: 'Coreia do Sul', region: 'asia', searchLabel: 'Korea' },
  { code: 'CN', name: 'China', region: 'asia', searchLabel: 'China' },
  { code: 'IN', name: 'Índia', region: 'asia', searchLabel: 'India' },
  { code: 'ID', name: 'Indonésia', region: 'asia', searchLabel: 'Indonesia' },
  { code: 'PH', name: 'Filipinas', region: 'asia', searchLabel: 'Philippines' },
  { code: 'TH', name: 'Tailândia', region: 'asia', searchLabel: 'Thailand' },
  { code: 'VN', name: 'Vietnã', region: 'asia', searchLabel: 'Vietnam' },
  { code: 'MY', name: 'Malásia', region: 'asia', searchLabel: 'Malaysia' },
  { code: 'SG', name: 'Singapura', region: 'asia', searchLabel: 'Singapore' },
  { code: 'TR', name: 'Turquia', region: 'asia', searchLabel: 'Türkiye' },
  { code: 'AE', name: 'Emirados Árabes', region: 'asia', searchLabel: 'UAE' },
  { code: 'GB', name: 'Reino Unido', region: 'europe', searchLabel: 'UK' },
  { code: 'FR', name: 'França', region: 'europe', searchLabel: 'France' },
  { code: 'DE', name: 'Alemanha', region: 'europe', searchLabel: 'Germany' },
  { code: 'ES', name: 'Espanha', region: 'europe', searchLabel: 'Spain' },
  { code: 'IT', name: 'Itália', region: 'europe', searchLabel: 'Italy' },
  { code: 'PT', name: 'Portugal', region: 'europe', searchLabel: 'Portugal' },
  {
    code: 'NL',
    name: 'Países Baixos',
    region: 'europe',
    searchLabel: 'Netherlands',
  },
  { code: 'PL', name: 'Polônia', region: 'europe', searchLabel: 'Poland' },
  { code: 'SE', name: 'Suécia', region: 'europe', searchLabel: 'Sweden' },
  { code: 'NO', name: 'Noruega', region: 'europe', searchLabel: 'Norway' },
  { code: 'FI', name: 'Finlândia', region: 'europe', searchLabel: 'Finland' },
  { code: 'DK', name: 'Dinamarca', region: 'europe', searchLabel: 'Denmark' },
  { code: 'IE', name: 'Irlanda', region: 'europe', searchLabel: 'Ireland' },
  { code: 'CH', name: 'Suíça', region: 'europe', searchLabel: 'Switzerland' },
  { code: 'AT', name: 'Áustria', region: 'europe', searchLabel: 'Austria' },
  { code: 'BE', name: 'Bélgica', region: 'europe', searchLabel: 'Belgium' },
  { code: 'CZ', name: 'Tchéquia', region: 'europe', searchLabel: 'Czechia' },
  { code: 'RO', name: 'Romênia', region: 'europe', searchLabel: 'Romania' },
  { code: 'GR', name: 'Grécia', region: 'europe', searchLabel: 'Greece' },
];

export const findCountry = (code: string) =>
  COUNTRIES.find((country) => country.code === code.toUpperCase());
