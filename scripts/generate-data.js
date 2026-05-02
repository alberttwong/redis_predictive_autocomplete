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
      description: `${name} inspired by ${franchise}, designed for ${audience.toLowerCase()} who want a ${color} ${category.toLowerCase()} with ${tags.slice(0, 3).join(", ")} details.`
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
