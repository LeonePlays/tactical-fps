/** Original playable arenas. This catalog has no renderer or server dependencies. */
export const MAP_CATALOG = [
  {
    id: 'industrial',
    name: 'Complexo Ferro',
    description: 'Pátio industrial, fábrica e cobertura de carga.',
    theme: 'industrial',
  },
  {
    id: 'old-quarter',
    name: 'Bairro Antigo',
    description: 'Praça, café e mercado com três acessos interiores.',
    theme: 'urban',
  },
  {
    id: 'dockyard',
    name: 'Cais de Carga',
    description: 'Escritório portuário e corredores entre contêineres.',
    theme: 'harbor',
  },
  {
    id: 'refinery',
    name: 'Refinaria Aurora',
    description: 'Tanques, tubulações e estação de manutenção.',
    theme: 'industrial',
  },
  {
    id: 'sandstone',
    name: 'Pedra do Sol',
    description: 'Fortificação de arenito e pátios de aproximação.',
    theme: 'desert',
  },
  {
    id: 'bazaar',
    name: 'Mercado Safira',
    description: 'Duas galerias e bancas intercaladas na rua central.',
    theme: 'desert',
  },
  {
    id: 'pine-outpost',
    name: 'Posto dos Pinheiros',
    description: 'Alojamento florestal, abrigo e barreiras de troncos.',
    theme: 'forest',
  },
  {
    id: 'alpine-depot',
    name: 'Depósito Alpino',
    description: 'Armazém de montanha e pátio de mantimentos.',
    theme: 'snow',
  },
  {
    id: 'research-lab',
    name: 'Laboratório Vértice',
    description: 'Alas de pesquisa opostas e corredores técnicos.',
    theme: 'laboratory',
  },
  {
    id: 'reactor',
    name: 'Núcleo 7',
    description: 'Sala do reator central e circuito de contenção.',
    theme: 'laboratory',
  },
  {
    id: 'old-fort',
    name: 'Forte das Marés',
    description: 'Muralhas com quatro portais e praça defensiva.',
    theme: 'ruins',
  },
  {
    id: 'rail-terminal',
    name: 'Terminal Norte',
    description: 'Vagões, plataformas de carga e sala de controle.',
    theme: 'industrial',
  },
  {
    id: 'shipyard',
    name: 'Estaleiro Azul',
    description: 'Doca de manutenção com casco e carga naval.',
    theme: 'harbor',
  },
  {
    id: 'desert-compound',
    name: 'Base Miragem',
    description: 'Instalações diagonais, depósitos e pátio aberto.',
    theme: 'desert',
  },
  {
    id: 'canal',
    name: 'Canal das Comportas',
    description: 'Três travessias e galerias de serviço entre canais.',
    theme: 'urban',
  },
  {
    id: 'concrete-bunker',
    name: 'Bunker Cinza',
    description: 'Salas protegidas e linhas de tiro em zigue-zague.',
    theme: 'industrial',
  },
  {
    id: 'observatory',
    name: 'Observatório Atlas',
    description: 'Estação de observação e pavilhão de instrumentos.',
    theme: 'snow',
  },
  {
    id: 'border-crossing',
    name: 'Fronteira Leste',
    description: 'Posto de inspeção com três passagens independentes.',
    theme: 'desert',
  },
  {
    id: 'village',
    name: 'Vila das Oliveiras',
    description: 'Três casas acessíveis e vielas assimétricas.',
    theme: 'urban',
  },
  {
    id: 'storm-drain',
    name: 'Galerias da Chuva',
    description: 'Condutos de drenagem, pilares e cruzamentos técnicos.',
    theme: 'industrial',
  },
] as const;

export type MapId = (typeof MAP_CATALOG)[number]['id'];
export type MapTheme = (typeof MAP_CATALOG)[number]['theme'];
export function isMapId(value: unknown): value is MapId {
  return typeof value === 'string' && MAP_CATALOG.some((map) => map.id === value);
}
export function mapInfo(id: MapId) {
  return MAP_CATALOG.find((map) => map.id === id) ?? MAP_CATALOG[0];
}
