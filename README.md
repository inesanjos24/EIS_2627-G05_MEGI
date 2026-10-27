# Relay — Courier Management System (Sprint 1, frontend)

Enterprise Information Systems 2026/2027 · FEUP · **Group 05 · M.EGI**
Repository: `EIS_2627-G05_MEGI`

A navigable static prototype (HTML5, CSS3, JavaScript) of a web-based enterprise information system for courier and logistics management, built from the group's Figma design. There is no backend yet (Sprint 2: PHP + database). Reloading a page brings back the sample data.

## Run it in Apache NetBeans

1. **File → New Project → HTML5/JavaScript → HTML5/JS Application** (empty template).
2. Copy everything in this folder into the project's `public_html` folder.
3. Right-click `index.html` → **Run File** (served on `http://localhost`, which the OpenStreetMap tiles need).
4. On the login page, use the **Demo access** links to open each user area.

## Pages (statement, section 3)

| Area | Pages | Main features |
|---|---|---|
| Public | `index.html`, `login.html`, `register.html`, `team.html` | Metrics and service highlights, login, registration by account type, academic identification of the team |
| Client | `client-profile.html`, `client-orders.html`, `client-order-created.html`, `client-order-history.html`, `client-products.html`, `client-edit-profile.html` | Product and order forms with GPS fields and a Leaflet map with a route polyline, order status, history with the e-POD of each order |
| Courier | `courier-active-order.html`, `courier-vehicles.html`, `courier-profile.html` | Active vehicle selector, route map (FEUP marker), sequential status buttons, e-POD (canvas signature or photo), available orders and consolidation, vehicles and document alerts |
| Staff | `staff-approvals.html`, `staff-profile.html` | Courier validation, vehicle approval, document alerts, disapproving vehicles with expired documents |
| Admin | `admin-panel.html`, `admin-dashboard.html`, `admin-profile.html` | Staff validation, operational KPI dashboard, personal information |

## Business rules implemented

| Rule | Source | Where |
|---|---|---|
| Order status is sequential: Initiated → In Progress → Completed / Cancelled | Statement 2.1 | `courier-active-order.html`, `js/app.js` §4 |
| Completing requires an e-POD (canvas signature or photo) | Statement 2.1 | `#epod` form |
| Single active task; several orders can be consolidated into one route | Statement 2.1 | Available orders |
| A cancelled order returns to the list of orders (attempt + 1) | Statement 2.1 | Cancel button |
| Order load (kg, m³) must fit the active vehicle, and vehicle capacity can't exceed its type limits | Statement 2 ("physical load constraints"), `Vehicle_Type` | `js/app.js` §3c, §5, §8 |
| Only Staff-approved vehicles with valid documents can be selected | Statement 2.1 (Staff) | Active vehicle selector |
| Staff **and** couriers are alerted when a document is expired or expires within **3 days**; Staff is alerted when a certificate is updated | Forum "Staff Use Case" (07/10) | `staff-approvals.html`, courier pages |
| Staff can **disapprove** a vehicle whose documents weren't updated by the deadline | Forum "Staff Use Case" (07/10) | Fleet documents table |
| Staff create their own account; it stays on hold until an Admin validates it | Forum "Staff account" (13/10) | `register.html`, `admin-panel.html` |
| Products: description, category (electronics, food, furniture, clothes…), weight_kg, volume_m3; the carrier doesn't need to know the content | Forum "Product Registration" (07/10) | Client product forms |
| The POD isn't checked; the client sees the POD of each order in the order history | Forum "Proof of delivery" (30/09) | `client-order-history.html` (e-POD viewer) |

## JavaScript validation (statement, section 5)

`js/validation.js` runs on every form. Empty required fields block submission and show a red message under each field plus an alert box. It also checks:

- GPS coordinates are numbers in range (latitude −90…90, longitude −180…180);
- email (regular expression);
- NIF (9 digits), phone and licence plate format;
- passwords (match and minimum length);
- uploaded files;
- expiry dates in the future.

## Files

| File | What it does |
|---|---|
| `css/style.css` | The only stylesheet: design tokens from Figma, Flexbox/Grid layouts, responsive breakpoints, utility classes (no inline `style=""`) |
| `js/data.js` | Sample test data (vehicles, vehicle types, dashboard series), with document dates relative to today |
| `js/validation.js` | Form validation |
| `js/map.js` | Leaflet / OpenStreetMap maps: GPS markers, route polyline, distance, click-to-set coordinates |
| `js/app.js` | Interactions and business rules (see the header of the file) |
| `js/leaflet/` | Leaflet 1.9.4 |
| `docs/er-diagram.png`, `docs/er-model.mmd` | Conceptual ER model (image + Mermaid source) |
| `docs/sample-certificate.pdf` | Placeholder for uploaded certificates |

## Notes

- Maps, fonts and road routes need internet access. Without the routing server, the map draws a dashed straight line with the straight-line distance.
- `img/hero.jpg` and `img/login.jpg` are exported from Figma (**Export → JPG**). Until then a soft gradient is shown.
- Sample people (Ana Ferreira, João Silva, Marta Costa, Rui Almeida…) are fictitious.
