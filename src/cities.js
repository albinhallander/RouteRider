// Curated list of cities most likely to be typed into the chat. Used by the
// fuzzy matcher in geocode.js to catch typos ("Stokholm", "Goteburg") before
// falling through to Nominatim. Aliases cover English exonyms and common
// accent-stripped spellings.

export const CITIES = [
  // Sweden
  { name: 'Stockholm',    aliases: [],                            lat: 59.3293, lng: 18.0686 },
  { name: 'Göteborg',     aliases: ['gothenburg', 'goteborg'],    lat: 57.7088, lng: 11.9746 },
  { name: 'Malmö',        aliases: ['malmo'],                     lat: 55.6050, lng: 13.0038 },
  { name: 'Uppsala',      aliases: [],                            lat: 59.8586, lng: 17.6389 },
  { name: 'Linköping',    aliases: ['linkoping'],                 lat: 58.4108, lng: 15.6214 },
  { name: 'Örebro',       aliases: ['orebro'],                    lat: 59.2741, lng: 15.2066 },
  { name: 'Västerås',     aliases: ['vasteras'],                  lat: 59.6099, lng: 16.5448 },
  { name: 'Helsingborg',  aliases: [],                            lat: 56.0465, lng: 12.6945 },
  { name: 'Jönköping',    aliases: ['jonkoping'],                 lat: 57.7826, lng: 14.1618 },
  { name: 'Norrköping',   aliases: ['norrkoping'],                lat: 58.5877, lng: 16.1924 },
  { name: 'Lund',         aliases: [],                            lat: 55.7047, lng: 13.1910 },
  { name: 'Gävle',        aliases: ['gavle'],                     lat: 60.6745, lng: 17.1417 },
  { name: 'Sundsvall',    aliases: [],                            lat: 62.3908, lng: 17.3069 },
  { name: 'Umeå',         aliases: ['umea'],                      lat: 63.8258, lng: 20.2630 },
  { name: 'Borås',        aliases: ['boras'],                     lat: 57.7210, lng: 12.9401 },
  { name: 'Eskilstuna',   aliases: [],                            lat: 59.3717, lng: 16.5077 },
  { name: 'Södertälje',   aliases: ['sodertalje'],                lat: 59.1955, lng: 17.6252 },
  { name: 'Karlstad',     aliases: [],                            lat: 59.3793, lng: 13.5036 },
  { name: 'Växjö',        aliases: ['vaxjo'],                     lat: 56.8777, lng: 14.8091 },
  { name: 'Halmstad',     aliases: [],                            lat: 56.6745, lng: 12.8578 },
  { name: 'Luleå',        aliases: ['lulea'],                     lat: 65.5848, lng: 22.1567 },
  { name: 'Trollhättan',  aliases: ['trollhattan'],               lat: 58.2836, lng: 12.2886 },
  { name: 'Östersund',    aliases: ['ostersund'],                 lat: 63.1792, lng: 14.6357 },
  { name: 'Karlskrona',   aliases: [],                            lat: 56.1621, lng: 15.5866 },
  { name: 'Kalmar',       aliases: [],                            lat: 56.6616, lng: 16.3616 },
  { name: 'Kristianstad', aliases: [],                            lat: 56.0294, lng: 14.1567 },
  { name: 'Falun',        aliases: [],                            lat: 60.6065, lng: 15.6355 },
  { name: 'Skövde',       aliases: ['skovde'],                    lat: 58.3911, lng: 13.8453 },
  { name: 'Skellefteå',   aliases: ['skelleftea'],                lat: 64.7507, lng: 20.9528 },
  { name: 'Uddevalla',    aliases: [],                            lat: 58.3498, lng: 11.9424 },
  { name: 'Varberg',      aliases: [],                            lat: 57.1059, lng: 12.2508 },
  { name: 'Nyköping',     aliases: ['nykoping'],                  lat: 58.7528, lng: 17.0075 },
  { name: 'Borlänge',     aliases: ['borlange'],                  lat: 60.4858, lng: 15.4371 },
  { name: 'Motala',       aliases: [],                            lat: 58.5382, lng: 15.0360 },
  { name: 'Visby',        aliases: [],                            lat: 57.6348, lng: 18.2948 },
  { name: 'Hässleholm',   aliases: ['hassleholm'],                lat: 56.1590, lng: 13.7659 },
  { name: 'Kiruna',       aliases: [],                            lat: 67.8558, lng: 20.2253 },
  { name: 'Mölndal',      aliases: ['molndal'],                   lat: 57.6554, lng: 12.0140 },
  { name: 'Partille',     aliases: [],                            lat: 57.7395, lng: 12.1069 },
  { name: 'Kungälv',      aliases: ['kungalv'],                   lat: 57.8708, lng: 11.9789 },
  { name: 'Mjölby',       aliases: ['mjolby'],                    lat: 58.3237, lng: 15.1275 },
  { name: 'Nässjö',       aliases: ['nassjo'],                    lat: 57.6525, lng: 14.6864 },
  { name: 'Värnamo',      aliases: ['varnamo'],                   lat: 57.1856, lng: 14.0445 },
  { name: 'Ystad',        aliases: [],                            lat: 55.4295, lng: 13.8204 },
  { name: 'Trelleborg',   aliases: [],                            lat: 55.3758, lng: 13.1568 },
  { name: 'Örnsköldsvik', aliases: ['ornskoldsvik'],              lat: 63.2909, lng: 18.7158 },
  { name: 'Piteå',        aliases: ['pitea'],                     lat: 65.3172, lng: 21.4797 },
  { name: 'Härnösand',    aliases: ['harnosand'],                 lat: 62.6323, lng: 17.9379 },

  // Norway
  { name: 'Oslo',         aliases: [],                            lat: 59.9139, lng: 10.7522 },
  { name: 'Bergen',       aliases: [],                            lat: 60.3913, lng:  5.3221 },
  { name: 'Trondheim',    aliases: [],                            lat: 63.4305, lng: 10.3951 },
  { name: 'Stavanger',    aliases: [],                            lat: 58.9700, lng:  5.7331 },
  { name: 'Kristiansand', aliases: [],                            lat: 58.1467, lng:  7.9956 },
  { name: 'Drammen',      aliases: [],                            lat: 59.7440, lng: 10.2045 },
  { name: 'Tromsø',       aliases: ['tromso'],                    lat: 69.6492, lng: 18.9553 },
  { name: 'Fredrikstad',  aliases: [],                            lat: 59.2181, lng: 10.9298 },

  // Denmark
  { name: 'København',    aliases: ['copenhagen', 'kopenhamn', 'köpenhamn'], lat: 55.6761, lng: 12.5683 },
  { name: 'Aarhus',       aliases: ['arhus'],                     lat: 56.1629, lng: 10.2039 },
  { name: 'Odense',       aliases: [],                            lat: 55.4038, lng: 10.4024 },
  { name: 'Aalborg',      aliases: [],                            lat: 57.0488, lng:  9.9217 },
  { name: 'Esbjerg',      aliases: [],                            lat: 55.4766, lng:  8.4594 },
  { name: 'Helsingør',    aliases: ['helsingor', 'elsinore'],     lat: 56.0360, lng: 12.6136 },

  // Finland
  { name: 'Helsinki',     aliases: ['helsingfors'],               lat: 60.1699, lng: 24.9384 },
  { name: 'Tampere',      aliases: [],                            lat: 61.4978, lng: 23.7610 },
  { name: 'Turku',        aliases: ['åbo', 'abo'],                lat: 60.4518, lng: 22.2666 },
  { name: 'Espoo',        aliases: [],                            lat: 60.2055, lng: 24.6559 },

  // Germany
  { name: 'Hamburg',      aliases: [],                            lat: 53.5511, lng:  9.9937 },
  { name: 'Berlin',       aliases: [],                            lat: 52.5200, lng: 13.4050 },
  { name: 'München',      aliases: ['munich', 'munchen'],         lat: 48.1351, lng: 11.5820 },
  { name: 'Frankfurt',    aliases: [],                            lat: 50.1109, lng:  8.6821 },
  { name: 'Köln',         aliases: ['cologne', 'koln'],           lat: 50.9375, lng:  6.9603 },
  { name: 'Düsseldorf',   aliases: ['dusseldorf'],                lat: 51.2277, lng:  6.7735 },
  { name: 'Bremen',       aliases: [],                            lat: 53.0793, lng:  8.8017 },
  { name: 'Hannover',     aliases: ['hanover'],                   lat: 52.3759, lng:  9.7320 },
  { name: 'Kiel',         aliases: [],                            lat: 54.3233, lng: 10.1228 },
  { name: 'Rostock',      aliases: [],                            lat: 54.0887, lng: 12.1400 },

  // Poland
  { name: 'Gdańsk',       aliases: ['gdansk', 'danzig'],          lat: 54.3520, lng: 18.6466 },
  { name: 'Warszawa',     aliases: ['warsaw'],                    lat: 52.2297, lng: 21.0122 },
  { name: 'Szczecin',     aliases: ['stettin'],                   lat: 53.4285, lng: 14.5528 },
  { name: 'Poznań',       aliases: ['poznan'],                    lat: 52.4064, lng: 16.9252 },

  // Netherlands / Belgium
  { name: 'Rotterdam',    aliases: [],                            lat: 51.9244, lng:  4.4777 },
  { name: 'Amsterdam',    aliases: [],                            lat: 52.3676, lng:  4.9041 },
  { name: 'Antwerpen',    aliases: ['antwerp'],                   lat: 51.2194, lng:  4.4025 },

  // Baltics
  { name: 'Tallinn',      aliases: [],                            lat: 59.4370, lng: 24.7536 },
  { name: 'Riga',         aliases: [],                            lat: 56.9496, lng: 24.1052 },
  { name: 'Vilnius',      aliases: [],                            lat: 54.6872, lng: 25.2797 }
];
