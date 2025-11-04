import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  Timestamp,
  addDoc,
  serverTimestamp,
  deleteDoc,
  doc,
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
let severityChart;

function updateAnalytics(reports) {
  const total = reports.length;
  const verified = reports.filter((r) => r.verifiedByModel).length;
  const unverified = total - verified;
  const uniqueUsers = new Set(reports.map((r) => r.userId)).size;

  const minor = reports.filter(
    (r) => (r.severity || "").toLowerCase() === "minor"
  ).length;
  const moderate = reports.filter(
    (r) => (r.severity || "").toLowerCase() === "moderate"
  ).length;
  const severe = reports.filter(
    (r) => (r.severity || "").toLowerCase() === "severe"
  ).length;

  // Update text counters
  document.getElementById("totalReports").textContent = total;
  document.getElementById("verifiedReports").textContent = verified;
  document.getElementById("unverifiedReports").textContent = unverified;
  document.getElementById("uniqueUsers").textContent = uniqueUsers;

  // 🎨 Update severity chart
  const ctx = document.getElementById("severityChart").getContext("2d");
  const data = {
    labels: ["Minor", "Moderate", "Severe"],
    datasets: [
      {
        label: "Accidents",
        data: [minor, moderate, severe],
        backgroundColor: ["#28a745", "#ffc107", "#dc3545"],
        borderColor: "#fff",
        borderWidth: 2,
      },
    ],
  };

  if (severityChart) {
    // Update existing chart
    severityChart.data = data;
    severityChart.update();
  } else {
    // Create chart initially
    severityChart = new Chart(ctx, {
      type: "pie",
      data,
      options: {
        responsive: true,
        maintainAspectRatio: true,
        layout: {
          padding: 20,
        },
        plugins: {
          legend: {
            position: "bottom",
            onClick: null,
            labels: {
              boxWidth: 12,
              padding: 15,
              usePointStyle: true,
            },
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const value = context.raw;
                const percentage = total
                  ? ((value / total) * 100).toFixed(1)
                  : 0;
                return `${context.label}: ${value} (${percentage}%)`;
              },
            },
          },
        },
      },
    });
  }
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
      querySnapshot.forEach((d) => {
        const data = d.data();
        data.docId = d.id; // ✅ store document ID
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
         <img src="${user.imageUrl}" 
              style="max-width:160px;border-radius:8px;box-shadow:0 0 6px rgba(0,0,0,0.2);cursor:pointer;" />
       </a>`
    : "N/A";

  const annotatedImage = user.annotatedImageUrl
    ? `<a href="${user.annotatedImageUrl}" target="_blank">
         <img src="${user.annotatedImageUrl}" 
              style="max-width:160px;border:3px solid #198754;border-radius:8px;box-shadow:0 0 6px rgba(0,0,0,0.2);cursor:pointer;" />
       </a>`
    : "N/A";

  const severity = user.severity ? user.severity.trim().toLowerCase() : "n/a";

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

  let responders;
  switch (severity) {
    case "severe":
      responders = [
        { type: "Imus Rescue Ambulance", count: 1 },
        { type: "PNP Imus Police Unit", count: 2 },
        { type: "BFP Imus Fire Truck (if fire or entrapment)", count: 1 },
        {
          type: "Imus City Traffic Management Office (CTMO) Enforcer",
          count: 2,
        },
      ];
      break;
    case "moderate":
      responders = [
        { type: "PNP Imus Police Unit", count: 1 },
        {
          type: "Imus Rescue Team (for medical check or minor injuries)",
          count: 1,
        },
        { type: "CTMO Traffic Enforcer", count: 1 },
      ];
      break;
    case "minor":
      responders = [
        { type: "CTMO Traffic Enforcer", count: 1 },
        { type: "PNP Imus Police Unit (for report filing)", count: 1 },
      ];
      break;
    default:
      responders = [{ type: "⚠️ Not available", count: "N/A" }];
  }

  const responderRows = responders
    .map(
      (r) =>
        `<tr>
          <td style="padding:6px 8px;">${r.type}</td>
          <td style="text-align:center;padding:6px 8px;">${r.count}</td>
        </tr>`
    )
    .join("");

  const severityColor =
    severity === "severe"
      ? "#dc3545"
      : severity === "moderate"
      ? "#ffc107"
      : severity === "minor"
      ? "#28a745"
      : "#6c757d";

  // ✅ Improved table design
  container.innerHTML = `
    <div style="border:1px solid #dee2e6;border-radius:10px;padding:20px;background:#fff;">

      <table class="table table-borderless align-middle" style="width:100%;">
        <tbody>
          <tr>
            <th style="width:220px;">Accident and Annotated</th>
            <td>
              <div style="display:flex;gap:12px;align-items:center;">
                ${accidentImage} ${annotatedImage}
              </div>
            </td>
          </tr>

          <tr>
            <th>Severity</th>
            <td>
              <span style="background-color:${severityColor};
                           color:#fff;
                           padding:3px 10px;
                           border-radius:6px;
                           font-weight:600;
                           text-transform:capitalize;">
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
                ? `<a href="https://www.google.com/maps?q=${user.latitude},${user.longitude}" target="_blank">
                     📍 View on Google Maps
                   </a>`
                : "N/A"
            }</td>
          </tr>

          <tr><th>Location</th><td>${user.locationText || "N/A"}</td></tr>

          <tr>
            <th>Recommended Emergency Responders</th>
            <td>
              <table style="width:100%;border:1px solid #dee2e6;border-radius:8px;overflow:hidden;">
                <thead style="background-color:#f8f9fa;">
                  <tr>
                    <th style="padding:6px 8px;text-align:left;">Type</th>
                    <th style="padding:6px 8px;text-align:center;">Recommended #</th>
                  </tr>
                </thead>
                <tbody>${responderRows}</tbody>
              </table>
            </td>
          </tr>

          <tr><th>Phone</th><td>${user.phone || "N/A"}</td></tr>
          <tr><th>User ID</th><td><code>${user.userId || "N/A"}</code></td></tr>
        </tbody>
      </table>
    </div>
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

  // ✅ Group reports by month
  const grouped = {};
  reports.forEach((report) => {
    const date = report._parsedDate || new Date(report.timestamp);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(report);
  });

  // ✅ Render accordion per month
  Object.keys(grouped)
    .sort((a, b) => b.localeCompare(a))
    .forEach((monthKey, idx) => {
      const [y, m] = monthKey.split("-");
      const monthName = new Date(y, m - 1).toLocaleString("default", {
        month: "long",
        year: "numeric",
      });

      const carouselId = `carousel-${monthKey}`;

      // ✅ Build all reports inside this month
      const reportsHTML = grouped[monthKey]
        .map((r, i) => {
          // Normalize severity
          const severity = r.severity ? r.severity.trim().toLowerCase() : "n/a";
          const severityColor =
            severity === "severe"
              ? "#dc3545"
              : severity === "moderate"
              ? "#ffc107"
              : severity === "minor"
              ? "#28a745"
              : "#6c757d";

          // ✅ Imus-based responders
          let responders;
          switch (severity) {
            case "severe":
              responders = [
                { type: "Imus Rescue Ambulance", count: 1 },
                { type: "PNP Imus Police Unit", count: 2 },
                {
                  type: "BFP Imus Fire Truck (if fire or entrapment)",
                  count: 1,
                },
                {
                  type: "Imus City Traffic Management Office (CTMO) Enforcer",
                  count: 2,
                },
              ];
              break;
            case "moderate":
              responders = [
                { type: "PNP Imus Police Unit", count: 1 },
                {
                  type: "Imus Rescue Team (for medical check or minor injuries)",
                  count: 1,
                },
                { type: "CTMO Traffic Enforcer", count: 1 },
              ];
              break;
            case "minor":
              responders = [
                { type: "CTMO Traffic Enforcer", count: 1 },
                { type: "PNP Imus Police Unit (for report filing)", count: 1 },
              ];
              break;
            default:
              responders = [{ type: "⚠️ Not available", count: "N/A" }];
          }

          const responderRows = responders
            .map(
              (r) =>
                `<tr>
                   <td style="padding:6px 8px;">${r.type}</td>
                   <td style="text-align:center;padding:6px 8px;">${r.count}</td>
                 </tr>`
            )
            .join("");

          // ✅ Handle timestamps safely
          let timestampStr = "N/A";
          if (r.timestamp) {
            try {
              const date = new Date(r.timestamp);
              timestampStr = isNaN(date.getTime())
                ? r.timestamp
                : date.toLocaleString();
            } catch {
              timestampStr = r.timestamp;
            }
          }

          // ✅ Image previews
          const accidentImage = r.imageUrl
            ? `<a href="${r.imageUrl}" target="_blank">
                 <img src="${r.imageUrl}" 
                      style="max-width:160px;border-radius:8px;box-shadow:0 0 6px rgba(0,0,0,0.2);cursor:pointer;" />
               </a>`
            : "N/A";

          const annotatedImage = r.annotatedImageUrl
            ? `<a href="${r.annotatedImageUrl}" target="_blank">
                 <img src="${r.annotatedImageUrl}" 
                      style="max-width:160px;border:3px solid #198754;border-radius:8px;box-shadow:0 0 6px rgba(0,0,0,0.2);cursor:pointer;" />
               </a>`
            : "N/A";

          // ✅ Detections list
          const detectionsHTML =
            r.detections && r.detections.length > 0
              ? r.detections
                  .map(
                    (d) =>
                      `Label: <b>${d.label || "N/A"}</b>, Confidence: ${
                        d.confidence
                          ? (d.confidence * 100).toFixed(1) + "%"
                          : "N/A"
                      }`
                  )
                  .join("<br>")
              : "N/A";

          // ✅ Final table per report
          return `
            <div class="carousel-item ${i === 0 ? "active" : ""}">
              <div class="p-3">
                <div style="border:1px solid #dee2e6;border-radius:10px;padding:20px;background:#fff;">
                  <h5 style="margin-bottom:10px;">Report ${i + 1}</h5>
                  <table class="table table-borderless align-middle" style="width:100%;">
                    <tbody>
                      <tr>
                        <th style="width:220px;">Accident and Annotated</th>
                        <td>
                          <div style="display:flex;gap:12px;align-items:center;">
                            ${accidentImage} ${annotatedImage}
                          </div>
                        </td>
                      </tr>

                      <tr>
                        <th>Severity</th>
                        <td>
                          <span style="background-color:${severityColor};
                                       color:#fff;
                                       padding:3px 10px;
                                       border-radius:6px;
                                       font-weight:600;
                                       text-transform:capitalize;">
                            ${r.severity || "N/A"}
                          </span>
                        </td>
                      </tr>

                      <tr><th>Verified by Model</th><td>${
                        r.verifiedByModel ? "✅ Yes" : "❌ No"
                      }</td></tr>

                      <tr><th>Detections</th><td>${detectionsHTML}</td></tr>
                      <tr><th>Timestamp</th><td>${timestampStr}</td></tr>

                      <tr>
                        <th>Location (Map)</th>
                        <td>${
                          r.latitude && r.longitude
                            ? `<a href="https://www.google.com/maps?q=${r.latitude},${r.longitude}" target="_blank">
                                 📍 View on Google Maps
                               </a>`
                            : "N/A"
                        }</td>
                      </tr>

                      <tr><th>Location</th><td>${
                        r.locationText || "N/A"
                      }</td></tr>

                      <tr>
                        <th>Recommended Emergency Responders</th>
                        <td>
                          <table style="width:100%;border:1px solid #dee2e6;border-radius:8px;overflow:hidden;">
                            <thead style="background-color:#f8f9fa;">
                              <tr>
                                <th style="padding:6px 8px;text-align:left;">Type</th>
                                <th style="padding:6px 8px;text-align:center;">Recommended #</th>
                              </tr>
                            </thead>
                            <tbody>${responderRows}</tbody>
                          </table>
                        </td>
                      </tr>

                      <tr><th>Phone</th><td>${r.phone || "N/A"}</td></tr>
                      <tr><th>Email</th><td>${r.email || "N/A"}</td></tr>
                      <tr><th>User ID</th><td><code>${
                        r.userId || "N/A"
                      }</code></td></tr>
                        </tbody>
                </table>

                <!-- 🗑️ Delete button -->
                <div style="display: flex; justify-content: center; margin-top: 10px;">
                  <button class="btn btn-sm btn-danger delete-report-btn" data-id="${
                    r.docId
                  }">
                    Delete Report
                  </button>
                </div>
                </div>
                </div>
                </div>
`;
        })
        .join("");

      // ✅ Append accordion item
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
                <div class="carousel-inner">${reportsHTML}</div>
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

  // attach delete button event listeners
  setTimeout(() => {
    document.querySelectorAll(".delete-report-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const docId = e.target.getAttribute("data-id");
        if (docId) deleteReport(docId);
      });
    });
  }, 300);
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

// Use event delegation — attach one listener to a parent container
document.addEventListener("click", async (e) => {
  if (e.target.classList.contains("delete-report-btn")) {
    const docId = e.target.getAttribute("data-id");

    if (
      !confirm(
        "Are you sure you want to delete this report? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      await deleteDoc(doc(db, "default", docId));
      alert("✅ Report successfully deleted.");
      e.target.closest(".report-card")?.remove(); // optional: remove from UI
    } catch (err) {
      console.error("Error deleting report:", err);
      alert("❌ Failed to delete report. Check console for details.");
    }
  }
});

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
