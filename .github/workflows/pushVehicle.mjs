import admin from "firebase-admin";
import { Octokit } from "@octokit/rest";
import fs from "fs";
import path from "path";

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const octokit = new Octokit({
  auth: process.env.GT_TOKEN,
});

const GITHUB_OWNER = "FrenckOfficial";
const GITHUB_REPO = "friuliemergenze.it";
const GITHUB_BRANCH = "main";

async function pushVehicleToGithub() {
  try {
    const draftId = process.env.DRAFT_ID;

    if (!draftId) {
      throw new Error("DRAFT_ID non fornito");
    }

    console.log(`\n📦 Pubblicazione bozza: ${draftId}`);

    const draftSnapshot = await db
      .collection("vehiclesDraft")
      .doc(draftId)
      .get();

    if (!draftSnapshot.exists) {
      throw new Error(`Bozza ${draftId} non trovata`);
    }

    const draft = draftSnapshot.data();
    console.log(`✅ Bozza caricata: ${draft.fileName}`);

    const fileName = draft.fileName.replace(/\.[^.]+$/, "");
    const vehicleData = draft.data;

    await updateGalleryJson(fileName, vehicleData, draft.photoUrl);
    console.log(`✅ gallery.json aggiornato`);

    await createVehicleDetailsPage(fileName, vehicleData);
    console.log(
      `✅ Pagina dettagli creata: gallery/scheda/${fileName}/index.html`,
    );

    await db.collection("vehiclesDraft").doc(draftId).update({
      status: "published",
      publishedAt: admin.firestore.Timestamp.now(),
      publishedBy: "github-action",
    });
    console.log(`✅ Status bozza aggiornato a 'published'`);

    console.log(
      `\n🎉 Veicolo "${vehicleData.title}" pubblicato con successo!\n`,
    );
  } catch (error) {
    console.error(`\n❌ Errore: ${error.message}\n`);

    try {
      const draftId = process.env.DRAFT_ID;
      if (draftId) {
        await db.collection("vehiclesDraft").doc(draftId).update({
          status: "error",
          errorMessage: error.message,
          errorAt: admin.firestore.Timestamp.now(),
        });
      }
    } catch (updateError) {
      console.error(
        "Errore nell'aggiornamento dello stato:",
        updateError.message,
      );
    }

    process.exit(1);
  }
}

async function updateGalleryJson(fileName, vehicleData, photoUrl) {
  try {
    const response = await octokit.repos.getContent({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: "gallery.json",
    });

    const currentContent = JSON.parse(
      Buffer.from(response.data.content, "base64").toString(),
    );

    if (!currentContent.vehicles) {
      currentContent.vehicles = [];
    }

    const vehicleIndex = currentContent.vehicles.findIndex(
      (v) => v.id === fileName,
    );

    const newVehicle = {
      id: fileName,
      title: vehicleData.title,
      brand: vehicleData.brand,
      model: vehicleData.model,
      plate: vehicleData.plate,
      image: `gallery/images/${photoUrl.split("/").pop()}`,
      detailsUrl: `gallery/scheda/${fileName}/`,
      published: new Date().toISOString(),
    };

    if (vehicleIndex >= 0) {
      currentContent.vehicles[vehicleIndex] = newVehicle;
    } else {
      currentContent.vehicles.push(newVehicle);
    }

    await octokit.repos.createOrUpdateFileContents({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: "gallery.json",
      message: `🚗 Add vehicle: ${vehicleData.title} (${vehicleData.plate})`,
      content: Buffer.from(JSON.stringify(currentContent, null, 2)).toString(
        "base64",
      ),
      sha: response.data.sha,
      branch: GITHUB_BRANCH,
    });
  } catch (error) {
    throw new Error(
      `Errore nell'aggiornamento di gallery.json: ${error.message}`,
    );
  }
}

async function createVehicleDetailsPage(fileName, vehicleData) {
  try {
    const htmlContent = generateVehicleHtml(vehicleData);

    await octokit.repos.createOrUpdateFileContents({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: `gallery/scheda/${fileName}/index.html`,
      message: `📄 Add vehicle details for ${vehicleData.title}`,
      content: Buffer.from(htmlContent).toString("base64"),
      branch: GITHUB_BRANCH,
    });
  } catch (error) {
    throw new Error(
      `Errore nella creazione della pagina dettagli: ${error.message}`,
    );
  }
}

function generateVehicleHtml(vehicleData, fileName) {
  const imageFileName = vehicleData.imageFileName || `${fileName}.jpg`;
  const pageUrl = `https://friuliemergenze.it/gallery/scheda/${fileName}`;

  return `<!doctype html>
<html lang="it">
  <head>
    <script src="https://embeds.iubenda.com/widgets/46908651-d6da-462f-b037-e6ef97c84795.js"><\/script>
    <script src="/heading.js"><\/script>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Type" content="text/html;charset=UTF-8" />
    <title>${escapeHtml(vehicleData.title)} | Friuli Emergenze</title>
    <script src="/heading.js"><\/script>

    <link rel="stylesheet" href="/style.css" />
    <link href="https://fonts.googleapis.com/css2?family=Lexend&display=swap" rel="stylesheet">
    <link rel="shortcut icon" href="/assets/logo.png" type="image/png" />
    <link
      href="https://cdnjs.cloudflare.com/ajax/libs/lightbox2/2.11.4/css/lightbox.min.css"
      rel="stylesheet"
    />
    <link
      rel="stylesheet"
      href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
    />
  </head>
  <body class="fade-in">
    <nav class="navbar">
      <div class="navbar-container">
        <a href="/" class="logo">🚨 Friuli Emergenze</a>
        <button class="menu-toggle" aria-label="Menu">
          <i class="fas fa-bars"><\/i>
        </button>
        <ul class="nav-links">
          <li><a href="/" class="nav-link">Home<\/a><\/li>
          <li><a href="/gallery" class="nav-link active">Galleria<\/a><\/li>
          <li><a href="/photobook" class="nav-link">Photobooks<\/a><\/li>
          <li><a href="/contact-us" class="nav-link">Contatti<\/a><\/li>
          
          <li><a href="https://myfrem.friuliemergenze.it" target="_blank" class="nav-icon" aria-label="MyFrEM">Progetto MyFrEM<\/a><\/li>
          <li><a href="https://instagram.com/friuliemergenze" target="_blank" class="nav-icon" aria-label="Instagram"><i class="fab fa-instagram"><\/i><\/a><\/li>
          <li><a href="https://chat.whatsapp.com/DxtvDvxXgWr5XVZ4ZkM4k1?mode=gi_t" target="_blank" class="nav-icon" aria-label="WhatsApp"><i class="fab fa-whatsapp"><\/i><\/a><\/li>
        <\/ul>
      <\/div>
    <\/nav>

    <main class="scheda-mezzo">
      <h1>${escapeHtml(vehicleData.title)}<\/h1>
      <img
        src="/assets/mezzi/${escapeHtml(imageFileName)}"
        alt="${escapeHtml(vehicleData.title)}"
      />

      <section class="dettagli-mezzo">
        <h2>Dati Tecnici<\/h2>
        <ul>
          <li><strong>Marca:<\/strong> ${escapeHtml(vehicleData.brand)}<\/li>
          <li><strong>Modello:<\/strong> ${escapeHtml(vehicleData.model)}<\/li>
          ${vehicleData.builder ? `<li><strong>Allestimento:<\/strong> ${escapeHtml(vehicleData.builder)}<\/li>` : ""}
          <li><strong>Targa:<\/strong> ${escapeHtml(vehicleData.plate)}<\/li>
          <li><strong>Servizio:<\/strong> ${escapeHtml(vehicleData.service)}<\/li>
          <li><strong>Sede:<\/strong> ${escapeHtml(vehicleData.headquarters)}<\/li>
          ${vehicleData.notes ? `<li><strong>Note:<\/strong> ${escapeHtml(vehicleData.notes)}<\/li>` : ""}
        <\/ul>
      <\/section>

      <div class="share">
        <span>Condividi su:<\/span>
        <!-- Facebook -->
        <div class="share-box">
          <a
            href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}"
            target="_blank"
            aria-label="Condividi su Facebook"
          >
            <i class="fab fa-facebook"><\/i> - Facebook
          <\/a>
        <\/div>
      <\/div>

      <div style="text-align: center; margin-top: 2rem">
        <a
          href="/gallery"
          style="
            display: inline-block;
            background-color: #00bcd4;
            color: white;
            padding: 0.8rem 1.5rem;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            transition: background-color 0.3s;
          "
        >
          ⬅ Torna alla galleria
        <\/a>
      <\/div>
    <\/main>

    <footer class="footer-clean">
      <div class="footer-container">
        <div class="footer-col">
          <p class="footer-brand">
            <a href="/"><i class="fa-regular fa-copyright"><\/i> 2026 Friuli Emergenze<\/a>
          <\/p>
          <p class="footer-desc">
            Pagina di condivisione foto e video di mezzi di soccorso. Ti diamo il benvenuto nel nostro sito ufficiale!
          <\/p>
        <\/div>

        <div class="footer-col">
          <p class="footer-paragraph">Vedi altre parti del nostro progetto!<\/p>
          <p class="footer-links">
            <a href="https://myfrem.friuliemergenze.it/" target="_blank" id="linkFooterBtn">MyFrEM<\/a>
            <span>·<\/span>
            <a href="/chi-sono" target="_blank" id="linkFooterBtn">Chi sono<\/a>
            <span>·<\/span>
            <a href="/contact-us" target="_blank" id="linkFooterBtn">Contatti<\/a>
          <\/p>
        <\/div>

        <div class="footer-col">
          <p class="footer-paragraph">Seguici sui nostri canali social<\/p>
          <p class="footer-social">
            <a href="/social/facebook" target="_blank"><i class="fa-brands fa-facebook"><\/i><\/a>
            <span>·<\/span>
            <a href="/social/instagram" target="_blank"><i class="fa-brands fa-instagram"><\/i><\/a>
            <span>·<\/span>
            <a href="/social/tiktok" target="_blank"><i class="fa-brands fa-tiktok"><\/i><\/a>
            <span>·<\/span>
            <a href="/social/whatsapp" target="_blank"><i class="fa-brands fa-whatsapp"><\/i><\/a>
          <\/p>
        <\/div>

        <div class="footer-col">
          <p class="footer-paragraph">Inviaci una mail<\/p>
          <p class="footer-extra" style="display:flex;align-items:center;justify-content:center;">
            <a href="mailto:info@friuliemergenze.it">
              <i class="fa-regular fa-envelope"><\/i>
            <\/a>
          <\/p>
        <\/div>
      <\/div>

      <div class="footer-bottom">
        <p class="footer-legal">
          <a href="https://www.iubenda.com/privacy-policy/95409163">Privacy Policy<\/a>
          <span>·<\/span>
          <a href="https://www.iubenda.com/privacy-policy/95409163/cookie-policy">Cookie Policy<\/a>
        <\/p>
        <p class="footer-extra"> 
          Versione 2.4.1.4
        <\/p>
      <\/div>
    <\/footer>

    <script src="/shinystat_script.js?USER=SS-53595029-55bae" style="display: none;"><\/script>
    <noscript>
      <a href="https://www.shinystat.com/it/" target="_top" style="display: none;">
      <img src="//www.shinystat.com/cgi-bin/shinystat.cgi?USER=SS-53595029-55bae" alt="Statistiche web" style="border:0px; display: none;" /><\/a>
    <\/noscript>
  <\/body>
<\/html>`;
}

function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

pushVehicleToGithub().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
