import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const franchises = [
  ["Mickey & Friends", ["Mickey Mouse", "Minnie Mouse", "Donald Duck", "Goofy", "Daisy Duck"]],
  ["Frozen", ["Elsa", "Anna", "Olaf", "Sven", "Kristoff"]],
  ["Moana", ["Moana", "Maui", "Pua", "Hei Hei", "Te Fiti"]],
  ["Lilo & Stitch", ["Stitch", "Lilo", "Angel", "Scrump", "Nani"]],
  ["Toy Story", ["Woody", "Buzz Lightyear", "Jessie", "Bo Peep", "Rex"]],
  ["The Little Mermaid", ["Ariel", "Flounder", "Sebastian", "Ursula", "Prince Eric"]],
  ["Star Wars", ["Grogu", "Mandalorian", "Ahsoka Tano", "R2-D2", "Leia Organa"]],
  ["Marvel", ["Spider-Man", "Black Panther", "Iron Man", "Captain Marvel", "Loki"]],
  ["Pixar", ["Remy", "Wall-E", "Joy", "Miguel", "Merida"]],
  ["Disney Parks", ["Figment", "Orange Bird", "Haunted Mansion", "Space Mountain", "Tiki Room"]]
];

const categories = [
  ["Plush", ["soft", "cuddly", "bedtime", "gift"]],
  ["Apparel", ["cotton", "everyday", "style", "park-ready"]],
  ["Collectible", ["display", "limited", "numbered", "collector"]],
  ["Toy", ["play", "interactive", "imaginative", "kids"]],
  ["Home", ["decor", "cozy", "kitchen", "living-room"]],
  ["Accessory", ["travel", "bag", "wearable", "daily"]],
  ["Book", ["story", "learning", "illustrated", "bedtime"]],
  ["Pin", ["trading", "enamel", "park", "lanyard"]]
];

const productTypes = {
  Plush: ["Cuddle Plush", "Weighted Plush", "Mini Bean Bag", "Sleepytime Plush", "Holiday Plush"],
  Apparel: ["Graphic Tee", "Hoodie", "Spirit Jersey", "Pajama Set", "Baseball Cap"],
  Collectible: ["Vinyl Figure", "Snow Globe", "Limited Statue", "Keepsake Ornament", "Display Diorama"],
  Toy: ["Play Set", "Action Figure", "Musical Wand", "Light-Up Spinner", "Puzzle Set"],
  Home: ["Ceramic Mug", "Throw Blanket", "Cookie Jar", "Wall Art", "Kitchen Apron"],
  Accessory: ["Mini Backpack", "Crossbody Bag", "Charm Bracelet", "Phone Case", "Water Bottle"],
  Book: ["Storybook", "Sticker Book", "Art Book", "Board Book", "Activity Journal"],
  Pin: ["Trading Pin", "Mystery Pin", "Jumbo Pin", "Limited Pin", "Starter Pin Set"]
};

const audiences = ["Kids", "Collectors", "Family", "Adults", "Park Fans"];
const colors = ["red", "blue", "gold", "silver", "teal", "lavender", "green", "black", "pink", "white"];

const localeText = {
  es: {
    editions: {
      "Limited Edition": "Edición limitada",
      "Park Exclusive": "Exclusivo del parque",
      Holiday: "Festivo",
      Classic: "Clásico"
    },
    categories: {
      Plush: "peluche",
      Apparel: "ropa",
      Collectible: "coleccionable",
      Toy: "juguete",
      Home: "hogar",
      Accessory: "accesorio",
      Book: "libro",
      Pin: "pin"
    },
    productTypes: {
      Plush: "peluche abrazable",
      Apparel: "camiseta gráfica",
      Collectible: "figura de vinilo",
      Toy: "set de juego",
      Home: "taza de cerámica",
      Accessory: "mochila pequeña",
      Book: "libro de cuentos",
      Pin: "pin de intercambio"
    },
    audiences: {
      Kids: "niños",
      Collectors: "coleccionistas",
      Family: "familias",
      Adults: "adultos",
      "Park Fans": "fans del parque"
    },
    colors: {
      red: "rojo",
      blue: "azul",
      gold: "dorado",
      silver: "plateado",
      teal: "verde azulado",
      lavender: "lavanda",
      green: "verde",
      black: "negro",
      pink: "rosa",
      white: "blanco"
    },
    characters: {}
  },
  fr: {
    editions: {
      "Limited Edition": "Édition limitée",
      "Park Exclusive": "Exclusivité du parc",
      Holiday: "Fête",
      Classic: "Classique"
    },
    categories: {
      Plush: "peluche",
      Apparel: "vêtement",
      Collectible: "objet de collection",
      Toy: "jouet",
      Home: "maison",
      Accessory: "accessoire",
      Book: "livre",
      Pin: "pin's"
    },
    productTypes: {
      Plush: "peluche câline",
      Apparel: "t-shirt graphique",
      Collectible: "figurine vinyle",
      Toy: "coffret de jeu",
      Home: "mug en céramique",
      Accessory: "mini sac à dos",
      Book: "livre d'histoires",
      Pin: "pin's à échanger"
    },
    audiences: {
      Kids: "enfants",
      Collectors: "collectionneurs",
      Family: "familles",
      Adults: "adultes",
      "Park Fans": "fans du parc"
    },
    colors: {
      red: "rouge",
      blue: "bleu",
      gold: "doré",
      silver: "argenté",
      teal: "bleu sarcelle",
      lavender: "lavande",
      green: "vert",
      black: "noir",
      pink: "rose",
      white: "blanc"
    },
    characters: {}
  },
  zh: {
    editions: {
      "Limited Edition": "限量版",
      "Park Exclusive": "乐园限定",
      Holiday: "节日",
      Classic: "经典"
    },
    categories: {
      Plush: "毛绒玩具",
      Apparel: "服饰",
      Collectible: "收藏品",
      Toy: "玩具",
      Home: "家居",
      Accessory: "配饰",
      Book: "图书",
      Pin: "徽章"
    },
    productTypes: {
      Plush: "抱抱毛绒玩具",
      Apparel: "图案T恤",
      Collectible: "乙烯基公仔",
      Toy: "游戏套装",
      Home: "陶瓷杯",
      Accessory: "迷你背包",
      Book: "故事书",
      Pin: "交换徽章"
    },
    audiences: {
      Kids: "儿童",
      Collectors: "收藏者",
      Family: "家庭",
      Adults: "成人",
      "Park Fans": "乐园粉丝"
    },
    colors: {
      red: "红色",
      blue: "蓝色",
      gold: "金色",
      silver: "银色",
      teal: "蓝绿色",
      lavender: "薰衣草色",
      green: "绿色",
      black: "黑色",
      pink: "粉色",
      white: "白色"
    },
    characters: {
      "Mickey Mouse": "米奇",
      "Minnie Mouse": "米妮",
      "Donald Duck": "唐老鸭",
      Goofy: "高飞",
      "Daisy Duck": "黛丝",
      Elsa: "艾莎",
      Anna: "安娜",
      Olaf: "雪宝",
      Sven: "斯文",
      Kristoff: "克斯托夫",
      Moana: "莫阿娜",
      Maui: "毛伊",
      Pua: "小猪噗噗",
      "Hei Hei": "嘿嘿",
      "Te Fiti": "特菲提",
      Stitch: "史迪奇",
      Lilo: "莉萝",
      Angel: "安琪",
      Scrump: "丑娃",
      Nani: "娜妮",
      Woody: "胡迪",
      "Buzz Lightyear": "巴斯光年",
      Jessie: "翠丝",
      "Bo Peep": "宝贝",
      Rex: "抱抱龙",
      Ariel: "爱丽儿",
      Flounder: "小比目鱼",
      Sebastian: "赛巴斯汀",
      Ursula: "乌苏拉",
      "Prince Eric": "艾瑞克王子",
      Grogu: "格罗古",
      Mandalorian: "曼达洛人",
      "Ahsoka Tano": "阿索卡",
      "R2-D2": "R2-D2",
      "Leia Organa": "莱娅",
      "Spider-Man": "蜘蛛侠",
      "Black Panther": "黑豹",
      "Iron Man": "钢铁侠",
      "Captain Marvel": "惊奇队长",
      Loki: "洛基",
      Remy: "小米",
      "Wall-E": "瓦力",
      Joy: "乐乐",
      Miguel: "米格",
      Merida: "梅莉达",
      Figment: "飞梦",
      "Orange Bird": "橙鸟",
      "Haunted Mansion": "幽灵公馆",
      "Space Mountain": "太空山",
      "Tiki Room": "提基屋"
    }
  }
};

function priceFor(index, category) {
  const base = {
    Plush: 22,
    Apparel: 34,
    Collectible: 55,
    Toy: 28,
    Home: 30,
    Accessory: 42,
    Book: 16,
    Pin: 13
  }[category];
  return Number((base + ((index * 7) % 41) + ((index % 5) * 0.99)).toFixed(2));
}

export function buildProducts(count = 2000) {
  const products = [];

  for (let index = 0; index < count; index += 1) {
    const [franchise, characters] = franchises[index % franchises.length];
    const character = characters[Math.floor(index / franchises.length) % characters.length];
    const [category, baseTags] = categories[(index * 3 + Math.floor(index / 5)) % categories.length];
    const type = productTypes[category][Math.floor(index / categories.length) % productTypes[category].length];
    const color = colors[(index * 11) % colors.length];
    const audience = audiences[(index * 7) % audiences.length];
    const edition = index % 9 === 0 ? "Limited Edition" : index % 7 === 0 ? "Park Exclusive" : index % 5 === 0 ? "Holiday" : "Classic";
    const season = index % 4 === 0 ? "spring" : index % 4 === 1 ? "summer" : index % 4 === 2 ? "fall" : "winter";
    const name = `${edition} ${character} ${type}`;
    const tags = [...new Set([...baseTags, color, season, edition.toLowerCase().replace(/\s+/g, "-")])];
    const i18n = Object.fromEntries(
      Object.entries(localeText).flatMap(([locale, translations]) => {
        const localizedEdition = translations.editions[edition];
        const localizedType = translations.productTypes[category];
        const localizedCategory = translations.categories[category];
        const localizedAudience = translations.audiences[audience];
        const localizedColor = translations.colors[color];
        const localizedCharacter = translations.characters[character] ?? character;
        const localizedName =
          locale === "zh"
            ? `${localizedEdition}${localizedCharacter}${localizedType}`
            : `${localizedEdition} ${localizedCharacter} ${localizedType}`;
        const localizedDescription =
          locale === "zh"
            ? `${localizedName} 灵感来自 ${franchise}，为${localizedAudience}设计，是一款${localizedColor}${localizedCategory}，带有 ${tags.slice(0, 3).join("、")} 细节。`
            : locale === "es"
              ? `${localizedName} inspirado en ${franchise}, diseñado para ${localizedAudience} que quieren un ${localizedCategory} ${localizedColor} con detalles ${tags.slice(0, 3).join(", ")}.`
              : `${localizedName} inspiré par ${franchise}, conçu pour les ${localizedAudience} qui veulent un ${localizedCategory} ${localizedColor} avec des détails ${tags.slice(0, 3).join(", ")}.`;

        return [
          [`name_${locale}`, localizedName],
          [`description_${locale}`, localizedDescription],
          [`character_${locale}`, localizedCharacter],
          [`category_${locale}`, localizedCategory],
          [`audience_${locale}`, localizedAudience]
        ];
      })
    );

    products.push({
      id: `dp-${String(index + 1).padStart(3, "0")}`,
      sku: `DIS-${String(index + 1).padStart(4, "0")}`,
      name,
      franchise,
      character,
      category,
      audience,
      color,
      tags,
      price: priceFor(index, category),
      rating: Number((3.8 + ((index * 13) % 13) / 10).toFixed(1)),
      popularity: 50 + ((index * 17) % 50),
      inStock: index % 11 !== 0,
      description: `${name} inspired by ${franchise}, designed for ${audience.toLowerCase()} who want a ${color} ${category.toLowerCase()} with ${tags.slice(0, 3).join(", ")} details.`,
      ...i18n
    });
  }

  return products;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outputPath = resolve(process.argv[2] ?? "data/disney-products.json");
  const products = buildProducts(2000);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(products, null, 2)}\n`);
  console.log(`Generated ${products.length} products at ${outputPath}`);
}
