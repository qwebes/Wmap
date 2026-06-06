# 💧 Wmap

**Wmap** is an interactive map for the instant search of drinking water machines.

We have combined all the city's water machine networks on a single map so users no longer have to check different manufacturers' websites separately. This is the only service where all drinking water machines are gathered in one place.

## 🎯 Problem & Relevance
The critical state of drinking water quality in Ukraine is a serious issue. WHO studies show that prolonged consumption of water with a high content of substances formed as a result of chlorination increases the risk of cancer. That is why quick access to clean drinking water through specialized machines is vital.

## ✨ Key Features & Functionality

* **📍 Unified Database:** All water machines on a single platform.
* **🟢 Real Status:** We show not just the locations, but the actual status of the machine (e.g., *"Working"*, *"Missing/Broken"*). The system displays the time of the last confirmation (e.g., *"Confirmed 2 hours ago"* or *"Needs verification"*).
* **🛡️ Automated Spam Protection:**
  * **Metadata Extraction:** The backend automatically extracts GPS coordinates directly from the EXIF data of the uploaded photo.
  * **Geo-Fencing:** The system compares the coordinates of the photo with the location on the map. If the discrepancy is greater than 30 meters, the update request is rejected. This reliably filters out fake locations.

## 🛠 Tech Stack

**Frontend:**
* HTML5
* CSS3
* JavaScript
* OpenStreetMap (for the interactive map)

**Backend & Database:**
* PHP
* MySQL

**Development Tools:**
* Git & GitHub
* Figma (UI/UX)

**Database scheme is in DB.sql**

## 🔒 Information Security
We take the security of our users and system seriously. The project includes the following defense methods against potential threats:

* **Account compromise:** Password hashing, Two-Factor Authentication (2FA), Email verification.
* **Data interception:** HTTPS (TLS), HttpOnly Cookies.
* **Intentional server overload:** DDoS Protection.
* **Session hijacking:** Token authorization via secure cookies.

## 👥 Our Team – Centrix

* **Maksym Martynyshyn** — Teamlead, Backend developer
* **Yuliia Martsiv** — Frontend developer
* **Kirill Konovalov** — Frontend developer
* **Vira Poberezhnyk** — UI/UX designer

---
*Created by Centrix*
