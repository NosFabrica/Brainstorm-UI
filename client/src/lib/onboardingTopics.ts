/**
 * The first run's topics (pages/FirstRunPage), everyday interests first —
 * Bitcoin is one topic among many, last, as "Money & Bitcoin" (2026-11-08).
 *
 * Each topic's people come from the house's list for it ("Onboarding ·
 * <label>", lib/onboardingPeople) when one is published, else the hand-picked
 * people here: a first draft from the people human-made follow packs on the
 * relay name most for the topic, read through Brainstorm's trust, plus
 * well-known outlets where packs are thin. `words` is the search that tops a
 * topic up when it has too few.
 */
export const ONBOARDING_TOPICS = [
  { key: "news", label: "News", words: "news" },
  { key: "music", label: "Music", words: "music" },
  { key: "sports", label: "Sports", words: "sports" },
  { key: "tech", label: "Technology", words: "developer" },
  { key: "art", label: "Art & design", words: "artist" },
  { key: "photo", label: "Photography", words: "photography" },
  { key: "science", label: "Science", words: "science" },
  { key: "health", label: "Health", words: "health" },
  { key: "games", label: "Gaming", words: "gaming" },
  { key: "business", label: "Business", words: "entrepreneur" },
  { key: "bitcoin", label: "Money & Bitcoin", words: "bitcoin" },
] as const;

export type OnboardingTopicKey = (typeof ONBOARDING_TOPICS)[number]["key"];
export type OnboardingTopic = (typeof ONBOARDING_TOPICS)[number];

/** The title of the house's list for a topic, the team's way to change who is suggested. */
export const houseListTitle = (topic: OnboardingTopic) => `Onboarding · ${topic.label}`;

export const HAND_PICKED: Record<OnboardingTopicKey, string[]> = {
  news: [
    "b1883e29b2e789214581722672a2ac9ffb45ffa2b68b53f5f12cd221872bb605", // AP News
    "2823c709e272c252515e483d9415acdff754ec946a7b7f126cc503b4c357d042", // Reuters
    "2edbcea694d164629854a52583458fd6d965b161e3c48b57d3aff01940558884", // The Nostr Report
    "9279276bffb83cee33946e564c3600a32840269a8206d01ddf40c6432baa0bcb", // Stacker News
    "e8d66519e43b1214ac68f9f2bdbc4386d41ac66b20c5a260b9b04102784074e9", // Nostr News Network
    "9c984b90ab003e922f941652f1815cf4740ce93c257d2d15266feed16552e368", // Hacker News 100
  ],
  music: [
    "28ca019b78b494c25a9da2d645975a8501c7e99b11302e5cbe748ee593fcb2cc",
    "8806372af51515bf4aef807291b96487ea1826c966a5596bca86697b5d8b23bc",
    "eeb11961b25442b16389fe6c7ebea9adf0ac36dd596816ea7119e521b8821b9e",
    "12c41114d90ecd0193d2036f2c454dbd1cbb2c33996d20533c0b5cd03f486cf5",
    "f133b246f07633fde1a894133ac270ab8750502b64a9779c0bac3c9228198dda",
    "dce8fd96692443f5ad71160f3195db6e6a8565b1cda2f28f75ad9c22d6fdae43",
  ],
  sports: [
    "21b1b8c0e8f7647e4a668b87d42c0d044b6ca85f8e752bad1fb68479be4ac929", // ESPN
    "0403c86a1bb4cfbc34c8a493fbd1f0d158d42dd06d03eaa3720882a066d3a378",
    "2c930918de42dca5d140c84c58e6d4f25b05a5d016171001c29c2a236d90c511",
    "bb9446848d107ce48e8f3810ca71365d3a31a63b911b3c4b0987d7f80bad3fda",
    "6bae33c8bc26a5c573912af4b96b6ef690258ea3735ba90ca05d9b7a607272e8",
  ],
  tech: [
    "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d",
    "32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245",
    "460c25e682fda7832b52d1f22d3d22b3176d972f60dcdc3212ed8c92ef85065c",
    "50d94fc2d8580c682b071a542f8b1e31a200b0508bab95a33bef0855df281d63",
    "97c70a44366a6535c145b333f973ea86dfdc2d7a99da618c40c64705ad98e322",
    "76c71aae3a491f1d9eec47cba17e229cda4113a0bbb6e6ae1776d7643e29cafa",
  ],
  art: [
    "f4db5270bd991b17bea1e6d035f45dee392919c29474bbac10342d223c74e0d0",
    "43baaf0c28e6cfb195b17ee083e19eb3a4afdfac54d9b6baf170270ed193e34c",
    "9356d008ab226ab6b08ab3c73900546b2836c48c7527f0e5332c09201a3e6dc8",
    "55f04590674f3648f4cdc9dc8ce32da2a282074cd0b020596ee033d12d385185",
    "3ef3be9db1e3f268f84e937ad73c68772a58c6ffcec1d42feeef5f214ad1eaf9",
    "afc0295d2c6e0a1820c214c07312070a4070d52083163d7fe410fa02bf85d9d2",
  ],
  photo: [
    "63d59db8d29abe29db7380beb912b8f600237332b6c9978b208694e4be170f6f",
    "64bfa9abffe5b18d0731eed57b38173adc2ba89bf87c168da90517f021e722b5",
    "1ebb28301aa1a48248d3723a0ea434bb7d4612ec920fa749583e3f41ce25849f",
    "6d5f85c4be85fabb803716cc002f46c88ad5d44dae8098f057482640a3f7e400",
    "34fad5244f7de844c1c9e001e2737ed23f3ea96ceda2e20d241d46fee5824f16",
    "7937540697665014c0de0809cdc75f37e900b1091a6b3d812af4178fe672caa9",
  ],
  science: [
    "1118cf721dfc5b93c5ae2dc43d6b0cdfcfdd244a602153914901f17340a3be92", // NASA Image of the Day
    "e85ed75286cb77475776c1007df8c4ff1c9c68eff91c3627347b065c5bf4dc78", // APOD
    "1266a86330a58a318246b97a1fda900b7da78db63dc70673fec8fdaab03fa4b7", // Nature
    "111cd02902d3e849b9cf3879efafdfd4587d8b51b42215d9bee8c78160796480", // WIRED Science
    "e7313ada7c7957a3d467c7058fb34eff9373f8a94bafa86618e205edc8c5277d",
    "01a6e6cde674144b820314156a63b8df9a593d308203f098279fdd9c179be76d",
  ],
  health: [
    "b12deee231e85bec19f3e4e3fee5893d449b8ce159ed2adcecf60262afca6d50",
    "af7673fb09d598eb63272cd7e6c1d1614031cdfc084c460f5d549be335dc7630",
    "cf578d5b8fb7c62563a803a30bd2fc3a952ca7ba9652ee2ce43a991316d8c157",
    "e0f5bf49899b84f18d58b8f510f352a26a23793b2d783aca6f780b3a99eff5a9",
    "a530f7f75b62f86073078fd0d82302508c9273ec846d19766ef41417eb820644",
    "1be9326168faf4f5ef18770ab163fe2c26bc049d21298186377cdc033bf69614",
  ],
  games: [
    "111647ac263ecb407f191dea6c5dc77ec22c99274da8a10a2c694d6965d03421", // IGN
    "7744c38a5915be8ac8fee2cd615473da463b5fa81d8876a499c9f99921558bdb", // GameSpot
    "a2fe647445d53597dc1ac928061cbfa052bbd794ce3d0449d2b70a4efc45b882", // ComicBook.com
    "86f02bd3ca347ede4d7aac8f860a35edff2969851b648d36335822c0238bb5dd",
  ],
  business: [
    "48cda3fb9091f77a84d72c2005ed4f4f7d1cae738315c5499679320f2f122aae", // Bloomberg Markets
    "9c5d0bfebc656f76e052f5e3e894a7789f7bac05d1feb45611bf62dffc66a50d", // The Economist
    "9c5d0eae57810b692b8dcf395844dd990d3cec6c7e57e042ead88cb811e78c01", // Financial Times
    "e0e92e542d79b28e79c6efe95891d38f49636e48560a8e618b953bded630dfaa",
  ],
  bitcoin: [
    "eab0e756d32b80bcd464f3d844b8040303075a13eabc3599a762c9ac7ab91f4f",
    "04c915daefee38317fa734444acee390a8269fe5810b2241e5e6dd343dfbecc9",
    "472f440f29ef996e92a186b8d320ff180c855903882e59d50de1b8bd5669301e",
    "6e468422dfb74a5738702a8823b9b28168abab8655faacb6853cd0ee15deee93",
    "83e818dfbeccea56b0f551576b3fd39a7a50e1d8159343500368fa085ccd964b",
    "85080d3bad70ccdcd7f74c29a44f55bb85cbcd3dd0cbb957da1d215bdb931204",
  ],
};
