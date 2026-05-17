import { ANSWER_WORDS, VALID_WORDS } from "./wordList";

// ─── Difficulty word tiers ────────────────────────────────────────────────────
// Easy: short, common, everyday words most people know
const EASY_WORDS = [
  "apple","beach","brain","bread","brick","bring","brook","brown","brush","build",
  "candy","chain","chair","chart","chase","cheap","check","chess","chest","child",
  "china","choir","civil","class","clean","clear","click","climb","clock","close",
  "cloud","coach","coast","coral","couch","count","court","cover","crack","craft",
  "crash","crazy","cream","creek","crime","crisp","cross","crowd","crown","crush",
  "daily","dance","dark","dates","diary","digit","dirty","disco","doing","doubt",
  "dough","draft","drain","drama","drape","dream","dress","drift","drink","drive",
  "drops","drove","drugs","drums","dryer","dwarf","dying","eager","early","earth",
  "eight","elite","empty","enemy","enjoy","enter","entry","equal","error","essay",
  "event","every","exact","exist","extra","fable","faced","fairy","faith","false",
  "fancy","fault","feast","fence","fever","fibre","field","fifth","fifty","fight",
  "filed","final","first","fixed","flame","flash","flask","fleet","flesh","float",
  "flood","floor","flour","flower","fluid","flute","focus","force","forge","forth",
  "found","frame","frank","fraud","fresh","front","frost","fruit","fully","funny",
  "ghost","giant","given","gland","glass","globe","gloom","glove","going","grace",
  "grade","grain","grand","grant","grape","grasp","grass","grave","great","green",
  "greet","grief","grill","grind","groan","group","grove","grown","guard","guest",
  "guide","guild","guile","guilt","guise","gulch","habit","happy","harsh","haven",
  "heart","heavy","hedge","hello","hence","herbs","hills","honey","honor","horse",
  "hotel","house","human","humor","hurry","ideal","image","imply","index","indie",
  "inner","input","issue","ivory","jewel","joint","joker","joust","judge","juice",
  "jumpy","Kenya","keyed","kicks","kills","kinds","kings","kneel","knife","knock",
  "known","label","lance","large","laser","later","laugh","layer","learn","leave",
  "legal","lemon","level","light","limit","linen","lists","liver","local","lodge",
  "logic","loose","lover","lower","lucky","lunar","lunch","lying","magic","major",
  "maple","march","marks","match","mayor","media","mercy","metal","might","minor",
  "minus","model","money","month","moral","motor","mount","mouse","mouth","movie",
  "music","naive","named","nasty","nerve","never","night","ninja","noble","noise",
  "north","noted","novel","nurse","nylon","occur","ocean","offer","often","onset",
  "opens","orbit","order","other","outer","ounce","owned","owner","oxide","ozone",
  "paint","panel","panic","paper","party","pasta","patch","pause","peace","peach",
  "pearl","penny","phone","photo","piano","picks","pilot","pinch","pixel","pizza",
  "place","plain","plane","plant","plate","plaza","plead","pluck","plumb","plume",
  "plump","plunge","point","polar","posed","pound","power","press","price","pride",
  "prime","print","prior","prize","probe","prone","proof","prose","proud","prove",
  "psalm","pulse","punch","pupil","queen","query","quest","queue","quick","quiet",
  "quota","quote","rabbi","radar","radio","raise","rally","ranch","range","rapid",
  "ratio","reach","ready","realm","rebel","recap","refer","reign","relax","reply",
  "repay","rider","rifle","right","rigid","risky","river","robot","rocky","roger",
  "roman","round","route","royal","rugby","ruler","rural","saint","salad","sauce",
  "scale","scare","scene","scope","score","scout","seize","sense","serve","seven",
  "shade","shake","shall","shame","shape","share","shark","sharp","sheer","sheep",
  "sheer","sheet","shelf","shell","shift","shine","shirt","shock","shoot","shore",
  "short","shout","sight","silly","since","sixth","sixty","sized","skill","slash",
  "slave","sleep","slice","slide","slope","small","smart","smell","smile","smoke",
  "snake","solar","solid","solve","sorry","south","space","spare","spark","speak",
  "speed","spend","spice","spike","spine","spite","split","spoke","spoon","sport",
  "spray","stack","staff","stage","stain","stair","stake","stale","stall","stamp",
  "stand","stare","start","state","stays","steal","steam","steel","steep","steer",
  "stern","stick","stiff","still","stock","stone","stood","store","storm","story",
  "stove","strip","stuck","study","stuff","style","sugar","suite","sunny","super",
  "surge","swamp","swear","sweep","sweet","swept","swift","swing","sword","sworn",
  "table","taken","taste","teach","tears","teens","teeth","tempo","tense","tenth",
  "terms","theft","their","theme","thick","thing","think","third","thorn","three",
  "threw","throw","thumb","tidal","tiger","tight","timer","tired","title","today",
  "token","tooth","topic","total","touch","tough","towel","tower","track","trade",
  "trail","train","trait","trash","treat","trend","trial","tribe","trick","tried",
  "troop","trout","truck","truly","trump","trunk","trust","truth","tumor","tuner",
  "twist","ultra","uncle","under","unify","union","until","upper","upset","urban",
  "usage","usual","utter","valid","value","valve","video","vigil","viral","virus",
  "visit","visor","vital","vivid","voice","voter","vague","vault","waste","watch",
  "water","weary","weave","wedge","weird","whale","wheat","wheel","where","which",
  "while","white","whole","whose","wider","witty","woman","women","woods","world",
  "worry","worse","worst","worth","would","wrath","wrist","write","wrong","yacht",
  "yearn","yield","young","youth","zebra","zesty",
];

// Advanced: uncommon, tricky, or less familiar words
const ADVANCED_WORDS = [
  "abaft","abase","abash","abate","abbey","abbot","abhor","abide","abjure","ablaze",
  "abode","abhor","abort","abrupt","abseil","abuse","abyss","acorn","acrid","acute",
  "adage","adept","adhere","adieu","adjoin","adobe","aegis","aeons","agave","agile",
  "aglow","agony","agora","aground","aided","albeit","album","algae","alibi","allay",
  "allot","alloy","aloft","altruism","amble","amiss","amity","amour","ample","annex",
  "annul","antic","anvil","aorta","arbor","ardor","arduous","argot","arid","arson",
  "ascot","askew","assay","astir","atoll","atone","attic","augur","avail","avert",
  "avid","avow","awash","awful","awoke","axiom","azure","babel","baize","balmy",
  "banal","barge","baron","basil","bawdy","bayou","bedew","befog","begot","beset",
  "bevy","bezel","bigot","bilge","bland","blase","bleat","bleed","blimp","bliss",
  "blot","bluff","blunt","blurb","blurt","bogus","borax","botch","brash","brawl",
  "brawn","braze","breve","brine","brisk","broil","brood","brunt","brusque","budge",
  "bulge","bumble","burly","butch","bylaw","byway","cache","cadge","cairn","cajole",
  "camel","cameo","canny","caper","carve","caste","cavil","chafe","chaff","chasm",
  "chide","chive","churl","cistern","cleft","clout","clung","coax","cobalt","colic",
  "comely","condone","conifer","copse","coquette","cordon","corvid","coven","covet",
  "creak","creed","crest","cringe","crimp","croon","crude","crypt","curio","curry",
  "cynic","daunt","debut","decry","deft","deign","delve","depot","deter","dexterity",
  "dirge","ditty","divot","dolor","dowry","dross","druid","duchy","dusky","eager",
  "easel","edict","egret","elegy","elite","ember","emery","emote","enact","endow",
  "endue","ensue","envoy","ephemeral","epoxy","erode","erupt","etude","evoke","exert",
  "exile","extol","exude","façade","factoid","fallacy","farce","feral","ferret","fetid",
  "fiend","filigree","flair","flank","flare","flaunt","flinch","flint","flout","fluke",
  "flunk","foray","forge","forte","forum","frond","froze","frugal","fungi","furor",
  "gamut","ganef","gaudy","gaunt","gauze","gavel","gazer","gecko","gelid","genre",
  "girth","glean","glint","gloat","gloss","glyph","gnarled","gnome","graft","grail",
  "grouse","gruel","guava","guile","gusto","gypsy","haiku","haste","havoc","heresy",
  "heron","hoard","hoary","hovel","hubris","hunch","hyena","hymen","ichor","idiom",
  "igloo","inept","inert","infer","ingot","inlay","inter","intrigue","irate","irksome",
  "irony","itchy","jaunt","jingo","joust","jumble","junto","karma","knave","knell",
  "knoll","kudos","kvetch","laden","laity","lapse","larder","largess","latch","latent",
  "laud","leach","leery","letch","levee","lewd","libel","liege","limbo","lithe",
  "livid","loath","lofty","loner","lore","lucid","lurid","lusty","macabre","malice",
  "manor","marsh","maxim","melee","menace","melee","mirth","miser","mitre","moat",
  "moist","molten","morose","motif","mourn","mucus","muted","myrrh","nadir","naive",
  "nefarious","nexus","nihil","nomad","notch","nuance","nugget","obese","oblique",
  "odium","offal","onset","orate","orchid","ordeal","ought","outdo","ovoid","pallid",
  "parch","pariah","parka","parody","parse","pathos","pauper","penal","peril","petty",
  "pewee","phage","pique","pithy","pivot","pixel","plaid","plait","plasm","pleat",
  "plod","ploy","pluck","plume","poach","poise","polka","potent","preen","prism",
  "privy","prowl","proxy","prude","psych","pugnacious","puny","puree","purge","putrid",
  "quaff","qualm","quell","quirk","quota","rabid","rapt","raven","raze","realm",
  "rebus","recant","recoil","redux","regal","replete","reprieve","resin","retort",
  "revel","revile","rigor","rivet","rogue","roost","rotund","rouse","rubric","rumen",
  "rupee","rustic","salvo","scamp","scant","scoff","scorn","scour","scowl","scram",
  "scrub","scuff","sedan","serf","sever","shoal","shrub","siege","sigma","sinew",
  "skiff","skimp","skint","skulk","slack","slake","slang","sleek","slew","sloth",
  "slump","slunk","smirk","smote","snide","sniff","snout","sooth","spate","spawn",
  "spear","speck","spiel","spire","splay","spore","squat","squid","staid","stark",
  "stave","steed","stoke","stomp","stout","strafe","strewn","strife","strive","stoic",
  "strop","strum","strut","stung","suave","sulky","sully","svelte","swath","swathe",
  "swill","swipe","swoon","tacit","talon","taper","tawny","terse","thane","throe",
  "tirade","toady","toil","tonic","torque","toxic","trample","tread","treason","tryst",
  "tulle","turbid","turgid","twerp","twill","udder","ulcer","undue","unruly","unwed",
  "usurp","vapid","venom","verge","vicar","vigor","viper","virile","visage","vitae",
  "vivace","vixen","vogue","voila","vomit","vouch","waver","whelp","whim","wince",
  "wispy","wrath","wrest","wring","wroth","yeoman","zeal","zealot","zilch","zloty",
];

export function pickSecretWord(difficulty: "easy" | "regular" | "advanced" = "regular"): string {
  if (difficulty === "easy") {
    return EASY_WORDS[Math.floor(Math.random() * EASY_WORDS.length)]!;
  }
  if (difficulty === "advanced") {
    return ADVANCED_WORDS[Math.floor(Math.random() * ADVANCED_WORDS.length)]!;
  }
  return ANSWER_WORDS[Math.floor(Math.random() * ANSWER_WORDS.length)]!;
}

export function isValidGuessWord(guess: string): boolean {
  return VALID_WORDS.has(guess.toLowerCase());
}

export function evaluateGuess(secret: string, guess: string): string[] {
  const result = Array(guess.length).fill("gray");
  const secretArr = secret.split("");
  guess.split("").forEach((char, i) => {
    if (char === secretArr[i]) {
      result[i] = "green";
      secretArr[i] = null as any;
    }
  });
  guess.split("").forEach((char, i) => {
    if (result[i] === "gray" && secretArr.includes(char)) {
      result[i] = "yellow";
      secretArr[secretArr.indexOf(char)] = null as any;
    }
  });
  return result;
}