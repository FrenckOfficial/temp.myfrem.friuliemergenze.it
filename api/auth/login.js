import * as admin from "firebase-admin";
import jwt from "jsonwebtoken";

const serviceAccount = JSON.parse(process.env.FIREBASE_PRIVATE_KEY);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'friuli-emergenze'
  });
}

const db = admin.firestore();
const auth = admin.auth();

async function getUserByUsername(username) {
  const snap = await db.collection("users")
    .where("username", "==", username)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].data();
}

async function getIpAddress(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress || "Non disponibile";
}

async function createLoginLog(userId, email, userAgent, ipAddress) {
  await db.collection("logins").add({
    userId,
    email,
    userAgent,
    ipAddress,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ error: "Email/username e password richiesti" });
    }

    let email = identifier;
    if (!identifier.includes("@")) {
      const userData = await getUserByUsername(identifier);
      if (!userData) {
        return res.status(404).json({ error: "Username non trovato" });
      }
      email = userData.email;
    }

    let user;
    try {
      user = await auth.getUserByEmail(email);
    } catch (error) {
      return res.status(404).json({ error: "Username non trovato" });
    }

    const userSnap = await db.collection("users").doc(user.uid).get();
    if (!userSnap.exists()) {
      return res.status(404).json({ error: "Profilo non trovato" });
    }

    const userData = userSnap.data();

    if (userData.status === "sospeso") {
      return res.status(403).json({ error: "Il tuo account è sospeso" });
    }
    if (userData.status === "eliminato") {
      return res.status(403).json({ error: "Il tuo account è stato eliminato" });
    }
    if (!userData.emailVerified) {
      return res.status(403).json({ error: "Verifica il tuo indirizzo email prima di accedere" });
    }

    const ipAddress = getIpAddress(req);
    const userAgent = req.headers["user-agent"] || "Non disponibile";
    await createLoginLog(user.uid, email, userAgent, ipAddress);

    const token = jwt.sign(
      {
        uid: user.uid,
        email: user.email,
        role: userData.role,
        nome: userData.name + " " + userData.surname
      },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    const isStaff = userData.role !== "user";
    const redirectUrl = isStaff
      ? `https://intranet.friuliemergenze.it/?token=${token}`
      : "/dashboard";

    return res.status(200).json({
      success: true,
      token,
      role: userData.role,
      redirectUrl
    });

  } catch (error) {
    console.error("Errore login:", error);
    return res.status(500).json({ error: "Errore interno del server" });
  }
}