# Relay – Courier Management System

Group project for **Enterprise Information Systems** (FEUP, 2026/2027), Group 05, M.EGI.

Relay is a web system to manage parcel deliveries: clients create orders, couriers deliver them with their vehicles, staff validate couriers and vehicles, and the admin manages staff and sees the main numbers of the business.

This is **Sprint 1**: only the frontend (HTML, CSS and JavaScript). There is no database yet, so the data shown comes from `js/data.js` and goes back to the original values when the page is reloaded. The backend is left for Sprint 2.

## How to run

1. Clone the repository in NetBeans (Team → Git → Clone).
2. Open the `ReLay` project.
3. Press Run (the green button). It opens `index.html` at `http://localhost:8383/ReLay/`.
4. On the login page, use the **Demo access** links to open each user area.

The maps and fonts need internet.

## Pages

| Area | Pages | Who |
|---|---|---|
| Public | index, login, register, team, track-order | Raul, Bea (track-order) |
| Client | client-profile, client-orders, client-products, client-edit-profile | Bea |
| Courier | courier-active-order, courier-vehicles, courier-profile | Inês |
| Staff | staff-approvals, staff-profile | Raul |
| Admin | admin-panel, admin-dashboard, admin-profile | Adriany |

## Main features

- Order and product forms with GPS coordinates and a Leaflet/OpenStreetMap map with the route
- Order tracking by order number, with the timeline and the courier's last shared location
- Courier order flow: Initiated → In Progress → Completed / Cancelled, with proof of delivery (signature or photo)
- One active order at a time, or several orders combined into one route (it checks if the load fits the vehicle)
- Vehicles can only be used after staff approval and while the insurance and inspection are valid
- Alerts when a document is expired or expires in the next 3 days (as answered in the project forum)
- Form validation in JavaScript (empty fields, numbers, coordinates, email, NIF, dates…)

## Folders

- `css/` – the stylesheet
- `js/` – `data.js` (test data), `validation.js` (forms), `map.js` (maps), `app.js` (courier, staff and shared code), `client.js`, `admin.js`, `track.js`
- `js/leaflet/` – the Leaflet library
- `img/` – images
- `docs/` – sample certificate used in the vehicle pages

## Conceptual model

`relay_class_diagram_v3.png` – UML class diagram used as the conceptual (ER) model.
