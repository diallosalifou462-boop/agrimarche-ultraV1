const sharp = require("sharp");

async function run() {
  await sharp("public/logo.png")
    .resize(192, 192)
    .png()
    .toFile("public/icons/icon-192.png");

  await sharp("public/logo.png")
    .resize(512, 512)
    .png()
    .toFile("public/icons/icon-512.png");

  console.log("Icônes PWA créées avec succès !");
}

run().catch(console.error);