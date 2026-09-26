// G-Code synthetic data lexicon: entities, colours, sizes, behaviours and
// world settings, each with English phrasing and inflected Polish forms.
// Polish nouns carry [nom, gen, acc, ins] singular and plural plus gender:
// m (inanimate), ma (animate masculine), mv (masculine personal), f, n.

const N = (s) => s.split(',').map((x) => x.trim());

const PL_NOUNS = {
  kula: ['f', 'kula,kuli,kulę,kulą', 'kule,kul,kule,kulami'],
  pilka: ['f', 'piłka,piłki,piłkę,piłką', 'piłki,piłek,piłki,piłkami'],
  szescian: ['m', 'sześcian,sześcianu,sześcian,sześcianem', 'sześciany,sześcianów,sześciany,sześcianami'],
  kostka: ['f', 'kostka,kostki,kostkę,kostką', 'kostki,kostek,kostki,kostkami'],
  klocek: ['m', 'klocek,klocka,klocek,klockiem', 'klocki,klocków,klocki,klockami'],
  pudelko: ['n', 'pudełko,pudełka,pudełko,pudełkiem', 'pudełka,pudełek,pudełka,pudełkami'],
  skrzynia: ['f', 'skrzynia,skrzyni,skrzynię,skrzynią', 'skrzynie,skrzyń,skrzynie,skrzyniami'],
  walec: ['m', 'walec,walca,walec,walcem', 'walce,walców,walce,walcami'],
  stozek: ['m', 'stożek,stożka,stożek,stożkiem', 'stożki,stożków,stożki,stożkami'],
  piramida: ['f', 'piramida,piramidy,piramidę,piramidą', 'piramidy,piramid,piramidy,piramidami'],
  pierscien: ['m', 'pierścień,pierścienia,pierścień,pierścieniem', 'pierścienie,pierścieni,pierścienie,pierścieniami'],
  donut: ['ma', 'donut,donuta,donuta,donutem', 'donuty,donutów,donuty,donutami'],
  gwiazda: ['f', 'gwiazda,gwiazdy,gwiazdę,gwiazdą', 'gwiazdy,gwiazd,gwiazdy,gwiazdami'],
  gwiazdka: ['f', 'gwiazdka,gwiazdki,gwiazdkę,gwiazdką', 'gwiazdki,gwiazdek,gwiazdki,gwiazdkami'],
  serce: ['n', 'serce,serca,serce,sercem', 'serca,serc,serca,sercami'],
  serduszko: ['n', 'serduszko,serduszka,serduszko,serduszkiem', 'serduszka,serduszek,serduszka,serduszkami'],
  diament: ['m', 'diament,diamentu,diament,diamentem', 'diamenty,diamentów,diamenty,diamentami'],
  klejnot: ['m', 'klejnot,klejnotu,klejnot,klejnotem', 'klejnoty,klejnotów,klejnoty,klejnotami'],
  krysztal: ['m', 'kryształ,kryształu,kryształ,kryształem', 'kryształy,kryształów,kryształy,kryształami'],
  drzewo: ['n', 'drzewo,drzewa,drzewo,drzewem', 'drzewa,drzew,drzewa,drzewami'],
  choinka: ['f', 'choinka,choinki,choinkę,choinką', 'choinki,choinek,choinki,choinkami'],
  dom: ['m', 'dom,domu,dom,domem', 'domy,domów,domy,domami'],
  domek: ['m', 'domek,domku,domek,domkiem', 'domki,domków,domki,domkami'],
  rakieta: ['f', 'rakieta,rakiety,rakietę,rakietą', 'rakiety,rakiet,rakiety,rakietami'],
  statek: ['m', 'statek kosmiczny,statku kosmicznego,statek kosmiczny,statkiem kosmicznym', 'statki kosmiczne,statków kosmicznych,statki kosmiczne,statkami kosmicznymi'],
  samochod: ['m', 'samochód,samochodu,samochód,samochodem', 'samochody,samochodów,samochody,samochodami'],
  auto: ['n', 'auto,auta,auto,autem', 'auta,aut,auta,autami'],
  autko: ['n', 'autko,autka,autko,autkiem', 'autka,autek,autka,autkami'],
  chmura: ['f', 'chmura,chmury,chmurę,chmurą', 'chmury,chmur,chmury,chmurami'],
  chmurka: ['f', 'chmurka,chmurki,chmurkę,chmurką', 'chmurki,chmurek,chmurki,chmurkami'],
  ludzik: ['ma', 'ludzik,ludzika,ludzika,ludzikiem', 'ludziki,ludzików,ludziki,ludzikami'],
  robot: ['ma', 'robot,robota,robota,robotem', 'roboty,robotów,roboty,robotami'],
  zombie: ['ma', 'zombie,zombie,zombie,zombie', 'zombie,zombie,zombie,zombie'],
  ryba: ['f', 'ryba,ryby,rybę,rybą', 'ryby,ryb,ryby,rybami'],
  rybka: ['f', 'rybka,rybki,rybkę,rybką', 'rybki,rybek,rybki,rybkami'],
  ptak: ['ma', 'ptak,ptaka,ptaka,ptakiem', 'ptaki,ptaków,ptaki,ptakami'],
  ptaszek: ['ma', 'ptaszek,ptaszka,ptaszka,ptaszkiem', 'ptaszki,ptaszków,ptaszki,ptaszkami'],
  duch: ['ma', 'duch,ducha,ducha,duchem', 'duchy,duchów,duchy,duchami'],
  duszek: ['ma', 'duszek,duszka,duszka,duszkiem', 'duszki,duszków,duszki,duszkami'],
  kwiat: ['m', 'kwiat,kwiatu,kwiat,kwiatem', 'kwiaty,kwiatów,kwiaty,kwiatami'],
  kwiatek: ['m', 'kwiatek,kwiatka,kwiatek,kwiatkiem', 'kwiatki,kwiatków,kwiatki,kwiatkami'],
  kamien: ['m', 'kamień,kamienia,kamień,kamieniem', 'kamienie,kamieni,kamienie,kamieniami'],
  skala: ['f', 'skała,skały,skałę,skałą', 'skały,skał,skały,skałami'],
  asteroida: ['f', 'asteroida,asteroidy,asteroidę,asteroidą', 'asteroidy,asteroid,asteroidy,asteroidami'],
  meteoryt: ['m', 'meteoryt,meteorytu,meteoryt,meteorytem', 'meteoryty,meteorytów,meteoryty,meteorytami'],
  ufo: ['n', 'ufo,ufo,ufo,ufo', 'ufo,ufo,ufo,ufo'],
  kosmita: ['mv', 'kosmita,kosmity,kosmitę,kosmitą', 'kosmici,kosmitów,kosmitów,kosmitami'],
  grzyb: ['ma', 'grzyb,grzyba,grzyba,grzybem', 'grzyby,grzybów,grzyby,grzybami'],
  grzybek: ['ma', 'grzybek,grzybka,grzybka,grzybkiem', 'grzybki,grzybków,grzybki,grzybkami'],
  balwan: ['ma', 'bałwan,bałwana,bałwana,bałwanem', 'bałwany,bałwanów,bałwany,bałwanami'],
  kot: ['ma', 'kot,kota,kota,kotem', 'koty,kotów,koty,kotami'],
  kotek: ['ma', 'kotek,kotka,kotka,kotkiem', 'kotki,kotków,kotki,kotkami'],
  pies: ['ma', 'pies,psa,psa,psem', 'psy,psów,psy,psami'],
  piesek: ['ma', 'piesek,pieska,pieska,pieskiem', 'pieski,piesków,pieski,pieskami'],
  moneta: ['f', 'moneta,monety,monetę,monetą', 'monety,monet,monety,monetami'],
  monetka: ['f', 'monetka,monetki,monetkę,monetką', 'monetki,monetek,monetki,monetkami'],
  balon: ['m', 'balon,balonu,balon,balonem', 'balony,balonów,balony,balonami'],
  balonik: ['ma', 'balonik,balonika,balonika,balonikiem', 'baloniki,baloników,baloniki,balonikami'],
  banka: ['f', 'bańka,bańki,bańkę,bańką', 'bańki,baniek,bańki,bańkami'],
  jablko: ['n', 'jabłko,jabłka,jabłko,jabłkiem', 'jabłka,jabłek,jabłka,jabłkami'],
  bomba: ['f', 'bomba,bomby,bombę,bombą', 'bomby,bomb,bomby,bombami'],
  potwor: ['ma', 'potwór,potwora,potwora,potworem', 'potwory,potworów,potwory,potworami'],
  potworek: ['ma', 'potworek,potworka,potworka,potworkiem', 'potworki,potworków,potworki,potworkami'],
  glut: ['ma', 'glut,gluta,gluta,glutem', 'gluty,glutów,gluty,glutami'],
  wrog: ['mv', 'wróg,wroga,wroga,wrogiem', 'wrogowie,wrogów,wrogów,wrogami'],
  przeciwnik: ['mv', 'przeciwnik,przeciwnika,przeciwnika,przeciwnikiem', 'przeciwnicy,przeciwników,przeciwników,przeciwnikami'],
  planeta: ['f', 'planeta,planety,planetę,planetą', 'planety,planet,planety,planetami'],
  ksiezyc: ['m', 'księżyc,księżyca,księżyc,księżycem', 'księżyce,księżyców,księżyce,księżycami'],
  slonce: ['n', 'słońce,słońca,słońce,słońcem', 'słońca,słońc,słońca,słońcami'],
  platek: ['m', 'płatek śniegu,płatka śniegu,płatek śniegu,płatkiem śniegu', 'płatki śniegu,płatków śniegu,płatki śniegu,płatkami śniegu'],
  sniezynka: ['f', 'śnieżynka,śnieżynki,śnieżynkę,śnieżynką', 'śnieżynki,śnieżynek,śnieżynki,śnieżynkami'],
  laser: ['m', 'laser,lasera,laser,laserem', 'lasery,laserów,lasery,laserami'],
  pocisk: ['m', 'pocisk,pocisku,pocisk,pociskiem', 'pociski,pocisków,pociski,pociskami'],
  kulaognia: ['f', 'kula ognia,kuli ognia,kulę ognia,kulą ognia', 'kule ognia,kul ognia,kule ognia,kulami ognia'],
  sniezka: ['f', 'śnieżka,śnieżki,śnieżkę,śnieżką', 'śnieżki,śnieżek,śnieżki,śnieżkami'],
  platforma: ['f', 'platforma,platformy,platformę,platformą', 'platformy,platform,platformy,platformami'],
  cegla: ['f', 'cegła,cegły,cegłę,cegłą', 'cegły,cegieł,cegły,cegłami'],
  paletka: ['f', 'paletka,paletki,paletkę,paletką', 'paletki,paletek,paletki,paletkami'],
  rura: ['f', 'rura,rury,rurę,rurą', 'rury,rur,rury,rurami'],
  kaktus: ['m', 'kaktus,kaktusa,kaktus,kaktusem', 'kaktusy,kaktusów,kaktusy,kaktusami'],
  pajak: ['ma', 'pająk,pająka,pająka,pająkiem', 'pająki,pająków,pająki,pająkami'],
  nietoperz: ['ma', 'nietoperz,nietoperza,nietoperza,nietoperzem', 'nietoperze,nietoperzy,nietoperze,nietoperzami'],
  pszczola: ['f', 'pszczoła,pszczoły,pszczołę,pszczołą', 'pszczoły,pszczół,pszczoły,pszczołami'],
  smok: ['ma', 'smok,smoka,smoka,smokiem', 'smoki,smoków,smoki,smokami'],
  czolg: ['m', 'czołg,czołgu,czołg,czołgiem', 'czołgi,czołgów,czołgi,czołgami'],
  samolot: ['m', 'samolot,samolotu,samolot,samolotem', 'samoloty,samolotów,samoloty,samolotami'],
  pingwin: ['ma', 'pingwin,pingwina,pingwina,pingwinem', 'pingwiny,pingwinów,pingwiny,pingwinami'],
  zaba: ['f', 'żaba,żaby,żabę,żabą', 'żaby,żab,żaby,żabami'],
  krolik: ['ma', 'królik,królika,królika,królikiem', 'króliki,królików,króliki,królikami'],
  flaga: ['f', 'flaga,flagi,flagę,flagą', 'flagi,flag,flagi,flagami'],
  skarb: ['m', 'skarb,skarbu,skarb,skarbem', 'skarby,skarbów,skarby,skarbami'],
  banan: ['ma', 'banan,banana,banana,bananem', 'banany,bananów,banany,bananami'],
  ciastko: ['n', 'ciastko,ciastka,ciastko,ciastkiem', 'ciastka,ciastek,ciastka,ciastkami'],
  cukierek: ['ma', 'cukierek,cukierka,cukierka,cukierkiem', 'cukierki,cukierków,cukierki,cukierkami'],
  pizza: ['f', 'pizza,pizzy,pizzę,pizzą', 'pizze,pizz,pizze,pizzami'],
  dynia: ['f', 'dynia,dyni,dynię,dynią', 'dynie,dyń,dynie,dyniami'],
  bohater: ['mv', 'bohater,bohatera,bohatera,bohaterem', 'bohaterowie,bohaterów,bohaterów,bohaterami'],
  boss: ['mv', 'boss,bossa,bossa,bossem', 'bossowie,bossów,bossów,bossami'],
  bonus: ['m', 'bonus,bonusu,bonus,bonusem', 'bonusy,bonusów,bonusy,bonusami'],
  wyjscie: ['n', 'wyjście,wyjścia,wyjście,wyjściem', 'wyjścia,wyjść,wyjścia,wyjściami'],
  portal: ['m', 'portal,portalu,portal,portalem', 'portale,portali,portale,portalami'],
};

export const PL = {};
for (const [k, [g, sg, pl]] of Object.entries(PL_NOUNS)) {
  const [nom, gen, acc, ins] = N(sg), [nomP, genP, accP, insP] = N(pl);
  PL[k] = { g, nom, gen, acc, ins, nomP, genP, accP, insP };
}

// key: shape, colour, [en sg, en pl, ...en synonyms as "sg/pl"], [pl nouns], extra
const E = (shape, color, en, pl, extra = {}) => ({ shape, color, en, pl, ...extra });
export const ENT = {
  ball: E('sphere', 'red', ['ball/balls'], ['pilka']),
  sphere: E('sphere', 'blue', ['sphere/spheres', 'orb/orbs'], ['kula']),
  cube: E('cube', 'orange', ['cube/cubes', 'block/blocks'], ['szescian', 'kostka', 'klocek']),
  box: E('cube', 'brown', ['box/boxes', 'crate/crates'], ['pudelko', 'skrzynia']),
  cylinder: E('cylinder', 'teal', ['cylinder/cylinders'], ['walec']),
  cone: E('cone', 'orange', ['cone/cones'], ['stozek']),
  pyramid: E('pyramid', 'yellow', ['pyramid/pyramids', 'triangle/triangles'], ['piramida']),
  ring: E('torus', 'gold', ['ring/rings'], ['pierscien']),
  donut: E('torus', 'pink', ['donut/donuts'], ['donut']),
  star: E('star', 'gold', ['star/stars'], ['gwiazda', 'gwiazdka']),
  heart: E('heart', 'red', ['heart/hearts'], ['serce', 'serduszko']),
  diamond: E('diamond', 'cyan', ['diamond/diamonds', 'gem/gems', 'crystal/crystals'], ['diament', 'klejnot', 'krysztal']),
  tree: E('tree', 'green', ['tree/trees'], ['drzewo', 'choinka']),
  house: E('house', 'beige', ['house/houses'], ['dom', 'domek']),
  rocket: E('rocket', 'white', ['rocket/rockets'], ['rakieta']),
  spaceship: E('rocket', 'silver', ['spaceship/spaceships', 'space ship/space ships'], ['statek']),
  car: E('car', 'red', ['car/cars'], ['samochod', 'auto', 'autko']),
  cloud: E('cloud', 'white', ['cloud/clouds'], ['chmura', 'chmurka']),
  person: E('person', 'blue', ['person/people', 'guy/guys', 'little man/little men'], ['ludzik']),
  robot: E('person', 'silver', ['robot/robots'], ['robot']),
  zombie: E('person', 'green', ['zombie/zombies'], ['zombie']),
  fish: E('fish', 'orange', ['fish/fish', 'goldfish/goldfish'], ['ryba', 'rybka']),
  bird: E('bird', 'yellow', ['bird/birds'], ['ptak', 'ptaszek']),
  ghost: E('ghost', 'white', ['ghost/ghosts'], ['duch', 'duszek']),
  flower: E('flower', 'pink', ['flower/flowers'], ['kwiat', 'kwiatek']),
  rock: E('rock', 'gray', ['rock/rocks', 'stone/stones', 'boulder/boulders'], ['kamien', 'skala']),
  asteroid: E('rock', 'gray', ['asteroid/asteroids'], ['asteroida']),
  meteor: E('rock', 'brown', ['meteor/meteors', 'meteorite/meteorites'], ['meteoryt']),
  ufo: E('ufo', 'green', ['UFO/UFOs', 'flying saucer/flying saucers'], ['ufo']),
  alien: E('ufo', 'lime', ['alien/aliens', 'invader/invaders'], ['kosmita']),
  mushroom: E('mushroom', 'red', ['mushroom/mushrooms'], ['grzyb', 'grzybek']),
  snowman: E('snowman', 'black', ['snowman/snowmen'], ['balwan']),
  cat: E('cat', 'orange', ['cat/cats', 'kitten/kittens', 'kitty/kitties'], ['kot', 'kotek']),
  dog: E('dog', 'brown', ['dog/dogs', 'puppy/puppies', 'doggo/doggos'], ['pies', 'piesek']),
  coin: E('coin', 'gold', ['coin/coins'], ['moneta', 'monetka']),
  balloon: E('sphere', 'red', ['balloon/balloons'], ['balon', 'balonik']),
  bubble: E('sphere', 'skyblue', ['bubble/bubbles'], ['banka']),
  apple: E('sphere', 'red', ['apple/apples'], ['jablko']),
  bomb: E('sphere', 'black', ['bomb/bombs'], ['bomba']),
  monster: E('cube', 'purple', ['monster/monsters'], ['potwor', 'potworek']),
  slime: E('sphere', 'lime', ['slime/slimes', 'blob/blobs'], ['glut']),
  enemy: E('cube', 'red', ['enemy/enemies', 'bad guy/bad guys'], ['wrog', 'przeciwnik']),
  planet: E('sphere', 'blue', ['planet/planets'], ['planeta']),
  moon: E('sphere', 'silver', ['moon/moons'], ['ksiezyc']),
  sun: E('sphere', 'yellow', ['sun/suns'], ['slonce'], { glow: true, size: 2 }),
  snowflake: E('star', 'white', ['snowflake/snowflakes'], ['platek', 'sniezynka']),
  laser: E('bullet', 'cyan', ['laser/lasers', 'laser beam/laser beams'], ['laser']),
  bullet: E('bullet', 'yellow', ['bullet/bullets'], ['pocisk']),
  fireball: E('sphere', 'orange', ['fireball/fireballs'], ['kulaognia'], { glow: true, size: 0.6 }),
  snowball: E('sphere', 'white', ['snowball/snowballs'], ['sniezka'], { size: 0.6 }),
  platform: E('box', 'brown', ['platform/platforms'], ['platforma']),
  brick: E('cube', 'orange', ['brick/bricks'], ['cegla', 'klocek']),
  paddle: E('box', 'white', ['paddle/paddles'], ['paletka']),
  pipe: E('cylinder', 'green', ['pipe/pipes'], ['rura']),
  cactus: E('cylinder', 'green', ['cactus/cacti'], ['kaktus']),
  spider: E('sphere', 'black', ['spider/spiders'], ['pajak']),
  bat: E('bird', 'black', ['bat/bats'], ['nietoperz']),
  bee: E('sphere', 'yellow', ['bee/bees'], ['pszczola'], { size: 0.6 }),
  dragon: E('bird', 'red', ['dragon/dragons'], ['smok'], { size: 2 }),
  tank: E('car', 'darkgreen', ['tank/tanks'], ['czolg']),
  airplane: E('rocket', 'white', ['airplane/airplanes', 'plane/planes'], ['samolot']),
  penguin: E('person', 'black', ['penguin/penguins'], ['pingwin']),
  frog: E('sphere', 'green', ['frog/frogs'], ['zaba']),
  bunny: E('sphere', 'white', ['bunny/bunnies', 'rabbit/rabbits'], ['krolik']),
  flag: E('cone', 'red', ['flag/flags'], ['flaga']),
  treasure: E('cube', 'gold', ['treasure/treasures', 'treasure chest/treasure chests'], ['skarb']),
  banana: E('capsule', 'yellow', ['banana/bananas'], ['banan']),
  cookie: E('coin', 'brown', ['cookie/cookies'], ['ciastko']),
  candy: E('sphere', 'pink', ['candy/candies', 'sweet/sweets'], ['cukierek']),
  pizza: E('coin', 'orange', ['pizza/pizzas', 'pizza slice/pizza slices'], ['pizza']),
  pumpkin: E('sphere', 'orange', ['pumpkin/pumpkins'], ['dynia']),
  hero: E('person', 'blue', ['hero/heroes'], ['bohater']),
  boss: E('ufo', 'red', ['boss/bosses'], ['boss'], { size: 3 }),
  powerup: E('star', 'gold', ['power-up/power-ups', 'powerup/powerups', 'bonus/bonuses'], ['bonus']),
  door: E('cube', 'brown', ['door/doors', 'exit/exits'], ['wyjscie'], { size: [1.4, 2.4, 0.4] }),
  portal: E('torus', 'violet', ['portal/portals'], ['portal'], { glow: true, size: 2 }),
};

export const ROLES = {
  character: ['person', 'robot', 'cat', 'dog', 'ball', 'cube', 'hero', 'penguin', 'frog', 'bunny', 'slime', 'ghost', 'snowman', 'zombie', 'sphere'],
  vehicle: ['rocket', 'spaceship', 'ufo', 'airplane', 'car', 'tank'],
  shooterPlayer: ['rocket', 'spaceship', 'ufo', 'airplane', 'tank', 'car', 'dragon', 'person', 'robot', 'cat'],
  shooterEnemy: ['ufo', 'alien', 'asteroid', 'meteor', 'monster', 'ghost', 'bird', 'bat', 'zombie', 'robot', 'bee', 'enemy', 'spider', 'pumpkin', 'slime', 'dragon'],
  projectile: ['laser', 'bullet', 'fireball', 'snowball', 'star', 'heart'],
  collectible: ['coin', 'star', 'diamond', 'apple', 'heart', 'banana', 'cookie', 'candy', 'flower', 'mushroom', 'pizza', 'treasure', 'snowflake', 'donut', 'ring'],
  obstacle: ['rock', 'cactus', 'box', 'cone', 'bomb', 'meteor', 'asteroid', 'fireball', 'snowball', 'tree', 'spider', 'zombie', 'pumpkin', 'cube'],
  walker: ['slime', 'monster', 'ghost', 'zombie', 'mushroom', 'spider', 'robot', 'enemy', 'frog', 'penguin', 'pumpkin'],
  flyer: ['bee', 'bat', 'bird', 'ghost', 'ufo', 'dragon'],
  tappable: ['balloon', 'bubble', 'ghost', 'star', 'fish', 'bird', 'ufo', 'bat', 'bee', 'heart', 'apple', 'alien', 'mushroom', 'pumpkin', 'candy', 'cloud'],
  chaser: ['zombie', 'ghost', 'monster', 'robot', 'dog', 'spider', 'enemy', 'slime', 'bee', 'alien', 'dragon'],
  scenery: ['tree', 'house', 'rock', 'cloud', 'flower', 'mushroom', 'cactus', 'snowman', 'box', 'pyramid'],
  prop: ['sphere', 'cube', 'cylinder', 'cone', 'pyramid', 'ring', 'donut', 'star', 'heart', 'diamond', 'ball', 'balloon', 'bubble', 'apple', 'planet', 'moon', 'sun', 'cloud', 'tree', 'house', 'rocket', 'car', 'fish', 'bird', 'ghost', 'flower', 'cat', 'dog', 'robot', 'ufo', 'snowman', 'mushroom', 'coin', 'bee', 'penguin', 'frog', 'bunny', 'pumpkin', 'dragon', 'spaceship', 'airplane', 'person', 'snowflake', 'candy', 'donut', 'cookie'],
};

export function enForms(key, R) {
  const opts = ENT[key].en;
  const [sg, pl] = R.pick(opts).split('/');
  return { sg, pl, a: /^[aeiou]/i.test(sg) && !/^(u[^f]|uni|eu)/i.test(sg) || /^UFO/.test(sg) ? 'an' : 'a' };
}

export function plNoun(key, R) { return PL[R.pick(ENT[key].pl)]; }

// ------------------------------------------------------------ colours --

export const COLOR_WORDS = {
  red: { en: ['red'], pl: ['czerwony'] }, orange: { en: ['orange'], pl: ['pomarańczowy'] },
  yellow: { en: ['yellow'], pl: ['żółty'] }, gold: { en: ['gold', 'golden'], pl: ['złoty'] },
  green: { en: ['green'], pl: ['zielony'] }, lime: { en: ['lime', 'light green'], pl: ['limonkowy', 'jasnozielony'] },
  teal: { en: ['teal', 'turquoise'], pl: ['turkusowy'] }, cyan: { en: ['cyan', 'aqua'], pl: ['cyjanowy', 'morski'] },
  blue: { en: ['blue'], pl: ['niebieski'] }, navy: { en: ['navy', 'dark blue'], pl: ['granatowy', 'ciemnoniebieski'] },
  skyblue: { en: ['light blue', 'sky blue'], pl: ['błękitny', 'jasnoniebieski'] },
  purple: { en: ['purple'], pl: ['fioletowy'] }, violet: { en: ['violet'], pl: ['liliowy'] },
  pink: { en: ['pink'], pl: ['różowy'] }, magenta: { en: ['magenta'], pl: ['amarantowy'] },
  brown: { en: ['brown'], pl: ['brązowy'] }, black: { en: ['black'], pl: ['czarny'] },
  white: { en: ['white'], pl: ['biały'] }, gray: { en: ['gray', 'grey'], pl: ['szary'] },
  silver: { en: ['silver', 'metal'], pl: ['srebrny'] }, beige: { en: ['beige'], pl: ['beżowy'] },
  darkgreen: { en: ['dark green'], pl: ['ciemnozielony'] }, coral: { en: ['coral'], pl: ['koralowy'] },
  rainbow: { en: ['rainbow', 'rainbow colored'], pl: ['tęczowy'] },
  random: { en: ['random colored', 'colorful', 'multicolored'], pl: ['różnokolorowy', 'wielokolorowy', 'kolorowy'] },
};
export const COLOR_KEYS = Object.keys(COLOR_WORDS).filter((k) => k !== 'random' && k !== 'rainbow');

// Polish adjective declension from the masculine nominative.
const VIR = [['ski', 'scy'], ['cki', 'ccy'], ['ki', 'cy'], ['gi', 'dzy'], ['ny', 'ni'], ['wy', 'wi'], ['ły', 'li'], ['ry', 'rzy'], ['ty', 'ci'], ['ży', 'zi'], ['dy', 'dzi'], ['chy', 'si'], ['cy', 'cy'], ['my', 'mi'], ['py', 'pi'], ['by', 'bi'], ['sy', 'si'], ['zy', 'zi']];
export function adj(base) {
  const soft = /[kg]i$/.test(base);
  const st = base.slice(0, -1);
  const i = soft ? 'i' : '';
  const y = soft ? 'i' : 'y';
  let vir = base;
  for (const [a, b] of VIR) if (base.endsWith(a)) { vir = base.slice(0, -a.length) + b; break; }
  return {
    m: { nom: base, gen: st + i + 'ego', acc: base, accA: st + i + 'ego', ins: st + y + 'm' },
    f: { nom: st + 'a', gen: st + i + 'ej', acc: st + 'ą', ins: st + 'ą' },
    n: { nom: st + i + 'e', gen: st + i + 'ego', acc: st + i + 'e', ins: st + y + 'm' },
    p: { nom: st + i + 'e', nomV: vir, gen: st + y + 'ch', acc: st + i + 'e', accV: st + y + 'ch', ins: st + y + 'mi' },
  };
}

// Agree an adjective (masc. nom. base) with a Polish noun in a case.
export function agree(base, noun, kase, plural) {
  const a = adj(base);
  if (plural) {
    if (noun.g === 'mv') return kase === 'nom' ? a.p.nomV : kase === 'acc' ? a.p.accV : a.p[kase];
    return a.p[kase];
  }
  const g = noun.g === 'f' ? 'f' : noun.g === 'n' ? 'n' : 'm';
  if (g === 'm' && kase === 'acc') return noun.g === 'm' ? a.m.acc : a.m.accA;
  return a[g][kase];
}

export function nounForm(noun, kase, plural) {
  const k = plural ? { nom: 'nomP', gen: 'genP', acc: 'accP', ins: 'insP' }[kase] : kase;
  return noun[k];
}

// ------------------------------------------------------------- sizes --

export const SIZES = {
  0.5: { en: ['tiny', 'little'], pl: ['malutki', 'maleńki'] },
  0.7: { en: ['small'], pl: ['mały'] },
  1.6: { en: ['big', 'large'], pl: ['duży', 'wielki'] },
  2.5: { en: ['huge', 'giant'], pl: ['ogromny', 'gigantyczny'] },
};

// --------------------------------------------------------- behaviours --
// code(k) builds the method call; k is the adverb factor (1, 2 fast, 0.5 slow).
// pl: [3sg, 3pl, participle base, reflexive]

export const BEHAV = {
  jump: { code: (k, hi) => `.jump(${hi ? 5 : 3}, ${fmt(1.2 / k)})`, en: [['jumps', 'jump', 'jumping'], ['hops', 'hop', 'hopping']], pl: [['skacze', 'skaczą', 'skaczący'], ['podskakuje', 'podskakują', 'podskakujący']], hi: true },
  bounce: { code: (k, hi) => `.bounce(${hi ? 5 : 3})`, en: [['bounces', 'bounce', 'bouncing']], pl: [['odbija się', 'odbijają się', 'odbijający', 'się'], ['sprężynuje', 'sprężynują', 'sprężynujący']], hi: true },
  spin: { code: (k) => `.spin(${fmt(1 * k)})`, en: [['spins', 'spin', 'spinning'], ['rotates', 'rotate', 'rotating'], ['turns around', 'turn around', 'turning']], pl: [['kręci się', 'kręcą się', 'kręcący', 'się'], ['obraca się', 'obracają się', 'obracający', 'się']] },
  float: { code: (k) => `.float(0.5, ${fmt(k)})`, en: [['floats', 'float', 'floating'], ['hovers', 'hover', 'hovering']], pl: [['unosi się', 'unoszą się', 'unoszący', 'się'], ['lewituje', 'lewitują', 'lewitujący']] },
  orbit: { code: (k) => `.orbit(4, ${fmt(0.5 * k)})`, en: [['orbits', 'orbit', 'orbiting'], ['circles around', 'circle around', 'circling']], pl: [['krąży', 'krążą', 'krążący'], ['lata w kółko', 'latają w kółko', 'latający w kółko']] },
  wander: { code: (k) => `.wander(${fmt(2 * k)})`, en: [['wanders around', 'wander around', 'wandering'], ['moves around', 'move around', 'roaming']], pl: [['błąka się', 'błąkają się', 'błąkający', 'się'], ['chodzi w kółko', 'chodzą w kółko', 'wędrujący']] },
  pulse: { code: (k) => `.pulse(0.2, ${fmt(3 * k)})`, en: [['pulses', 'pulse', 'pulsing']], pl: [['pulsuje', 'pulsują', 'pulsujący']] },
  rainbow: { code: (k) => `.rainbow(${fmt(k)})`, en: [['changes colors', 'change colors', 'color-changing']], pl: [['zmienia kolory', 'zmieniają kolory', 'zmieniający kolory']] },
  blink: { code: (k) => `.blink(${fmt(2 * k)})`, en: [['blinks', 'blink', 'blinking'], ['flashes', 'flash', 'flashing']], pl: [['miga', 'migają', 'migający'], ['mruga', 'mrugają', 'mrugający']] },
  glow: { code: () => '.glow()', en: [['glows', 'glow', 'glowing'], ['shines', 'shine', 'shining']], pl: [['świeci', 'świecą', 'świecący'], ['błyszczy', 'błyszczą', 'błyszczący']] },
  grow: { code: (k) => `.grow(${fmt(0.3 * k)}, 3)`, en: [['grows', 'grow', 'growing']], pl: [['rośnie', 'rosną', 'rosnący']] },
  wobble: { code: (k) => `.wobble(0.25, ${fmt(3 * k)})`, en: [['wobbles', 'wobble', 'wobbling'], ['sways', 'sway', 'swaying']], pl: [['kołysze się', 'kołyszą się', 'kołyszący', 'się'], ['chwieje się', 'chwieją się', 'chwiejący', 'się']] },
  trail: { code: () => '.trail()', en: [['leaves a trail', 'leave a trail', null]], pl: [['zostawia ślad', 'zostawiają ślad', 'zostawiający ślad']] },
  moveRight: { code: (k) => `.move('right', ${fmt(3 * k)}).wrap()`, en: [['moves right', 'move right', 'moving right'], ['goes to the right', 'go to the right', null]], pl: [['jedzie w prawo', 'jadą w prawo', 'jadący w prawo'], ['porusza się w prawo', 'poruszają się w prawo', 'poruszający', 'się w prawo']] },
  moveLeft: { code: (k) => `.move('left', ${fmt(3 * k)}).wrap()`, en: [['moves left', 'move left', 'moving left']], pl: [['jedzie w lewo', 'jadą w lewo', 'jadący w lewo'], ['porusza się w lewo', 'poruszają się w lewo', 'poruszający', 'się w lewo']] },
  flyUp: { code: (k) => `.move('up', ${fmt(2 * k)}).wrap()`, en: [['flies up', 'fly up', 'rising'], ['goes up', 'go up', null]], pl: [['leci do góry', 'lecą do góry', 'lecący do góry'], ['wznosi się', 'wznoszą się', 'wznoszący', 'się']] },
  patrol: { code: (k) => `.patrol(4, ${fmt(2 * k)})`, en: [['walks back and forth', 'walk back and forth', null], ['patrols', 'patrol', 'patrolling']], pl: [['chodzi tam i z powrotem', 'chodzą tam i z powrotem', null], ['patroluje', 'patrolują', 'patrolujący']] },
};

export const ADVERB = {
  fast: { k: 2, en: ['fast', 'quickly', 'really fast'], pl: ['szybko', 'bardzo szybko'] },
  slow: { k: 0.5, en: ['slowly', 'gently'], pl: ['powoli', 'wolno'] },
};

export function fmt(x) { return String(Math.round(x * 100) / 100); }

// -------------------------------------------------------------- world --

export const SKY = {
  day: { en: ['on a sunny day', 'during the day', 'in daylight'], pl: ['w słoneczny dzień', 'w dzień', 'za dnia'] },
  night: { en: ['at night', 'at nighttime', 'under the night sky'], pl: ['w nocy', 'nocą', 'pod nocnym niebem'] },
  sunset: { en: ['at sunset', 'at dusk'], pl: ['o zachodzie słońca', 'o zmierzchu'] },
  dawn: { en: ['at dawn', 'at sunrise'], pl: ['o świcie', 'o wschodzie słońca'] },
  space: { en: ['in space', 'in outer space'], pl: ['w kosmosie', 'w przestrzeni kosmicznej'] },
  storm: { en: ['in a storm', 'during a thunderstorm'], pl: ['w czasie burzy', 'podczas burzy'] },
  underwater: { en: ['underwater', 'under the sea', 'at the bottom of the ocean'], pl: ['pod wodą', 'na dnie morza', 'w oceanie'] },
  candy: { en: ['in candy land', 'in a candy world'], pl: ['w krainie słodyczy', 'w cukierkowym świecie'] },
};

export const GROUND = {
  grass: { en: ['on the grass', 'on a meadow', 'in a field'], pl: ['na trawie', 'na łące', 'na polu'] },
  sand: { en: ['on the beach', 'in the desert', 'on sand'], pl: ['na plaży', 'na pustyni', 'na piasku'] },
  snow: { en: ['in the snow', 'on snow'], pl: ['na śniegu', 'w śniegu'] },
  water: { en: ['on the water', 'on a lake'], pl: ['na wodzie', 'na jeziorze'] },
  lava: { en: ['over lava', 'above a lava lake'], pl: ['nad lawą', 'nad jeziorem lawy'] },
  stone: { en: ['on stone', 'in a cave'], pl: ['na kamieniach', 'w jaskini'] },
  ice: { en: ['on ice', 'on a frozen lake'], pl: ['na lodzie', 'na zamarzniętym jeziorze'] },
  none: { en: ['floating in the void', 'with no ground'], pl: ['w pustce', 'bez podłoża'] },
};

export const WEATHER = {
  rain: { en: ['while it rains', 'in the rain', 'with rain'], pl: ['w deszczu', 'kiedy pada deszcz', 'z deszczem'] },
  snow: { en: ['while it snows', 'with snowfall', 'with falling snow'], pl: ['kiedy pada śnieg', 'w czasie śnieżycy', 'z padającym śniegiem'] },
};

export const MUSIC = {
  happy: { en: ['with happy music', 'with cheerful music'], pl: ['z wesołą muzyką', 'z radosną muzyką'] },
  spooky: { en: ['with spooky music', 'with creepy music'], pl: ['ze straszną muzyką', 'z mroczną muzyką'] },
  epic: { en: ['with epic music', 'with an epic soundtrack'], pl: ['z epicką muzyką'] },
  chill: { en: ['with chill music', 'with relaxing music'], pl: ['ze spokojną muzyką', 'z relaksującą muzyką'] },
  retro: { en: ['with retro music', 'with 8-bit music', 'with chiptune music'], pl: ['z muzyką retro', 'z 8-bitową muzyką'] },
};

export const MODE = {
  '2d': { en: ['2d', '2D', 'two-dimensional'], pl: ['2d', '2D', 'dwuwymiarowy'] },
  '3d': { en: ['3d', '3D', 'three-dimensional'], pl: ['3d', '3D', 'trójwymiarowy'] },
};

export const NUM_EN = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 12: 'twelve', 15: 'fifteen', 20: 'twenty', 30: 'thirty' };
export const NUM_PL = { 2: 'dwa', 3: 'trzy', 4: 'cztery', 5: 'pięć', 6: 'sześć', 7: 'siedem', 8: 'osiem', 9: 'dziewięć', 10: 'dziesięć', 12: 'dwanaście', 15: 'piętnaście', 20: 'dwadzieścia', 30: 'trzydzieści' };

// Polish counted noun phrase: returns [numeral, case of noun, plural flag]
export function plCount(n, noun) {
  const f = noun.g === 'f';
  let word = NUM_PL[n] || String(n);
  if (n === 2 && f) word = 'dwie';
  if (n === 2 && noun.g === 'mv') word = 'dwóch';
  if ((n === 3 || n === 4) && noun.g === 'mv') word = n === 3 ? 'trzech' : 'czterech';
  const nomPl = n % 10 >= 2 && n % 10 <= 4 && (n < 10 || n > 20) && noun.g !== 'mv';
  return { word, kase: nomPl ? 'nom' : 'gen', plural: true };
}
