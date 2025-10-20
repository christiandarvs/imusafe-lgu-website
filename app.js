import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  Timestamp,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyC491Y7_dxqrIGek4Yv9tw1sNu-C3yh5rk",
  authDomain: "imusafe-official.firebaseapp.com",
  projectId: "imusafe-official",
  storageBucket: "imusafe-official.firebasestorage.app",
  messagingSenderId: "1014619473396",
  appId: "1:1014619473396:web:8d92df19337e93de9ba5a1",
  measurementId: "G-WVPJVKHN1P",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Protect dashboard
onAuthStateChanged(auth, (user) => {
  if (!user || user.email !== "imusafeofficial@gmail.com") {
    console.log("Unauthorized — redirecting to login.");
    signOut(auth).catch((e) => console.warn("signOut error:", e));
    window.location.replace("login.html");
  } else {
    console.log("✅ Authorized — starting listener");
    startListeningReports();
  }
});


// Audio alerts
const alertSound = new Audio("accident-notification.wav");
let lastSeenTimestamp = 0;
let allReports = [];
function updateAnalytics(reports) {
  const total = reports.length;
  const verified = reports.filter((r) => r.verifiedByModel).length;
  const unverified = total - verified;
  const uniqueUsers = new Set(reports.map((r) => r.userId)).size;

  document.getElementById("totalReports").textContent = total;
  document.getElementById("verifiedReports").textContent = verified;
  document.getElementById("unverifiedReports").textContent = unverified;
  document.getElementById("uniqueUsers").textContent = uniqueUsers;
}

function startListeningReports() {
  const usersRef = collection(db, "default");
  onSnapshot(
    usersRef,
    (querySnapshot) => {
      if (querySnapshot.empty) {
        document.getElementById("latest-report-data").innerHTML =
          "<p class='text-muted'>No reports found.</p>";
        document.getElementById("all-reports-data").innerHTML =
          "<p class='text-muted'>No reports found.</p>";
        return;
      }

      const reports = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.timestamp instanceof Timestamp) {
          data._parsedDate = data.timestamp.toDate();
        } else {
          data._parsedDate = new Date(data.timestamp);
        }
        reports.push(data);
      });

      reports.sort((a, b) => b._parsedDate - a._parsedDate);
      updateAnalytics(reports);

      const latestTimestamp = reports[0]._parsedDate.getTime();
      if (latestTimestamp > lastSeenTimestamp) {
        if (lastSeenTimestamp !== 0) {
          alertSound.play().catch((e) => console.warn("sound error:", e));
        }
        lastSeenTimestamp = latestTimestamp;
      }

      displayLatestReport(reports[0]);
      displayAllReports(reports);
    },
    (err) => console.error("onSnapshot error:", err)
  );
}

function displayLatestReport(user) {
  const container = document.getElementById("latest-report-data");
  if (!container) return;

  const accidentImage = user.imageUrl
    ? `<a href="${user.imageUrl}" target="_blank">
         <img src="${user.imageUrl}" style="max-width:150px;cursor:pointer;" />
       </a>`
    : "N/A";

  const annotatedImage = user.annotatedImageUrl
    ? `<a href="${user.annotatedImageUrl}" target="_blank">
         <img src="${user.annotatedImageUrl}" 
              style="max-width:150px;cursor:pointer;border:2px solid green;" />
       </a>`
    : "N/A";

  // ✅ Normalize severity
  const severity = user.severity ? user.severity.trim().toLowerCase() : "n/a";

  // Handle timestamp
  let timestampStr = "N/A";
  if (user.timestamp) {
    try {
      const date = new Date(user.timestamp);
      timestampStr = isNaN(date.getTime())
        ? user.timestamp
        : date.toLocaleString();
    } catch (e) {
      timestampStr = user.timestamp;
    }
  }

  // Generate responders based on severity
  let responders;
  switch (severity) {
    case "severe":
      responders = [
        { type: "Ambulance", count: 1 },
        { type: "Police Unit", count: 2 },
        { type: "Fire Rescue (if needed)", count: 1 },
        { type: "Traffic Enforcer", count: 2 },
      ];
      break;
    case "moderate":
      responders = [
        { type: "Ambulance", count: 1 },
        { type: "Police Unit", count: 1 },
        { type: "Traffic Enforcer", count: 1 },
      ];
      break;
    case "minor":
      responders = [
        { type: "Police Unit", count: 1 },
        { type: "Traffic Enforcer", count: 1 },
      ];
      break;
    default:
      responders = [{ type: "⚠️ Not available", count: "N/A" }];
  }

  // Build responder rows
  const responderRows = responders
    .map((r) => `<tr><td>${r.type}</td><td>${r.count}</td></tr>`)
    .join("");

  // ✅ Determine color based on normalized severity
  const severityColor =
    severity === "severe"
      ? "#dc3545"
      : severity === "moderate"
      ? "#ffc107"
      : severity === "minor"
      ? "#28a745"
      : "#6c757d";

  // Insert final HTML
  container.innerHTML = `
    <table class="table table-bordered align-middle">
      <tbody>
        <tr>
          <th>Accident and Annotated</th>
          <td style="display:flex; gap:10px;">
            ${accidentImage} ${annotatedImage}
          </td>
        </tr>

        <!-- SEVERITY (colored text) -->
        <tr>
          <th>Severity</th>
          <td>
            <span style="font-weight:bold; color:${severityColor}">
              ${user.severity || "N/A"}
            </span>
          </td>
        </tr>

        <tr><th>Verified by Model</th><td>${
          user.verifiedByModel ? "✅ Yes" : "❌ No"
        }</td></tr>

        <tr>
          <th>Detections</th>
          <td>${
            user.detections && user.detections.length > 0
              ? user.detections
                  .map(
                    (d) =>
                      `Label: <b>${d.label || "N/A"}</b>, Confidence: ${
                        d.confidence
                          ? (d.confidence * 100).toFixed(1) + "%"
                          : "N/A"
                      }`
                  )
                  .join("<br>")
              : "N/A"
          }</td>
        </tr>

        <tr><th>Timestamp</th><td>${timestampStr}</td></tr>

        <tr>
          <th>Location (Map)</th>
          <td>${
            user.latitude && user.longitude
              ? `<a href="https://www.google.com/maps?q=${user.latitude},${user.longitude}" target="_blank">📍 View on Google Maps</a>`
              : "N/A"
          }</td>
        </tr>

        <tr><th>Location</th><td>${user.locationText || "N/A"}</td></tr>
        <tr>
          <th>Recommended Emergency Responders</th>
          <td>
            <table class="table table-sm table-bordered align-middle mb-0">
              <thead>
                <tr style="background-color:#f8f9fa;">
                  <th>Type</th>
                  <th>Recommended Number</th>
                </tr>
              </thead>
              <tbody>${responderRows}</tbody>
            </table>
          </td>
        </tr>
        <tr><th>Phone</th><td>${user.phone || "N/A"}</td></tr>
        <tr><th>User ID</th><td>${user.userId || "N/A"}</td></tr>

        
      </tbody>
    </table>
  `;
}

// 🔍 render filtered reports
function displayAllReports(reports) {
  allReports = reports;
  renderReports(reports);
}

function renderReports(reports) {
  const container = document.getElementById("all-reports-data");
  if (!container) return;

  container.innerHTML = `<div class="accordion" id="monthAccordion"></div>`;
  const accordion = document.getElementById("monthAccordion");

  const grouped = {};
  reports.forEach((report) => {
    const date = report._parsedDate;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(report);
  });

  Object.keys(grouped)
    .sort((a, b) => b.localeCompare(a))
    .forEach((monthKey, idx) => {
      const [y, m] = monthKey.split("-");
      const monthName = new Date(y, m - 1).toLocaleString("default", {
        month: "long",
        year: "numeric",
      });

      // 🔄 Carousel for accidents in this month
      const carouselId = `carousel-${monthKey}`;
      const reportsHTML = grouped[monthKey]
        .map((r, i) => {
          const img = r.imageUrl
            ? `<a href="${r.imageUrl}" target="_blank">
          <img src="${r.imageUrl}" class="d-block mx-auto" style="max-height:300px; object-fit:contain;" />
        </a>`
            : "N/A";

          const detectionsHTML =
            r.detections && r.detections.length > 0
              ? r.detections
                  .map(
                    (d) =>
                      `Label: <b>${d.label}</b>, Confidence: ${(
                        d.confidence * 100
                      ).toFixed(1)}%`
                  )
                  .join("<br>")
              : "N/A";

          return `
      <div class="carousel-item ${i === 0 ? "active" : ""}">
        <div class="p-3">
          <h5>Report ${i + 1}</h5>
          <table class="table table-bordered mt-2">
            <tbody>
              <tr><th>Accident Image</th><td>${img}</td></tr>
              <tr><th>Annotated Image</th><td>${
                r.annotatedImageUrl
                  ? `<a href="${r.annotatedImageUrl}" target="_blank"><img src="${r.annotatedImageUrl}" style="max-width:120px;border:2px solid green;" /></a>`
                  : "N/A"
              }</td></tr>

              <tr><th>Timestamp</th><td>${r._parsedDate.toLocaleString()}</td></tr>
              <tr>
                <th>Location (Map)</th>
                <td>${
                  r.latitude && r.longitude
                    ? `<a href="https://www.google.com/maps?q=${r.latitude},${r.longitude}" target="_blank">📍 View on Google Maps</a>`
                    : "N/A"
                }</td>
              </tr>
              <tr><th>Location</th><td>${r.locationText || "N/A"}</td></tr>
              <tr><th>Phone</th><td>${r.phone || "N/A"}</td></tr>
              <tr><th>Email</th><td>${r.email || "N/A"}</td></tr>
              <tr><th>User ID</th><td>${r.userId || "N/A"}</td></tr>
              <tr><th>Verified by Model</th><td>${
                r.verifiedByModel ? "✅ Yes" : "❌ No"
              }</td></tr>
              <tr><th>Detections</th><td>${detectionsHTML}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
        })
        .join("");

      accordion.innerHTML += `
        <div class="accordion-item">
          <h2 class="accordion-header">
            <button class="accordion-button ${idx > 0 ? "collapsed" : ""}"
              type="button" data-bs-toggle="collapse"
              data-bs-target="#collapse-${monthKey}">
              ${monthName}
            </button>
          </h2>
          <div id="collapse-${monthKey}" class="accordion-collapse collapse ${
        idx === 0 ? "show" : ""
      }">
            <div class="accordion-body">
              <div id="${carouselId}" class="carousel slide" data-bs-ride="carousel">
                <div class="carousel-inner">
                  ${reportsHTML}
                </div>
                <button class="carousel-control-prev" type="button" data-bs-target="#${carouselId}" data-bs-slide="prev">
                  <span class="carousel-control-prev-icon" aria-hidden="true"></span>
                  <span class="visually-hidden">Previous</span>
                </button>
                <button class="carousel-control-next" type="button" data-bs-target="#${carouselId}" data-bs-slide="next">
                  <span class="carousel-control-next-icon" aria-hidden="true"></span>
                  <span class="visually-hidden">Next</span>
                </button>
              </div>
            </div>
          </div>
        </div>`;
    });
}

if (!document.getElementById("carousel-style")) {
  const style = document.createElement("style");
  style.id = "carousel-style";
  style.textContent = `
    .carousel-control-prev-icon,
    .carousel-control-next-icon {
      filter: invert(1) grayscale(100); /* make arrows black */
      width: 2.5rem;
      height: 2.5rem;
    }
  `;
  document.head.appendChild(style);
}

async function simulateNewReport() {
  const usersRef = collection(db, "default");
  await addDoc(usersRef, {
    timestamp: serverTimestamp(),
    locationText: "🚨 Simulated Accident Site",
    phone: "+639123456789",
    email: "simulation@test.com",
    userId: "testUser123",
    imageUrl: "https://placehold.co/600x400?text=Simulated+Accident",
    verifiedByModel: false,
  });
  console.log("✅ Simulated report added!");
}

// DOM ready
document.addEventListener("DOMContentLoaded", () => {
  startListeningReports();

  const simulateBtn = document.getElementById("simulateBtn");
  if (simulateBtn) simulateBtn.addEventListener("click", simulateNewReport);

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await signOut(auth);
      localStorage.clear();
      sessionStorage.clear();
      window.location.replace("login.html");
    });
  }

  // 🔍 search filter
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase();
      const filtered = allReports.filter((r) => {
        return (
          (r.locationText && r.locationText.toLowerCase().includes(q)) ||
          (r.email && r.email.toLowerCase().includes(q)) ||
          (r.phone && r.phone.toLowerCase().includes(q)) ||
          (r.userId && r.userId.toLowerCase().includes(q))
        );
      });
      renderReports(filtered);
    });
  }
});
