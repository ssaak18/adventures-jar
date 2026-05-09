const USERS_KEY = "adventure-jar:users:v1";
const SESSION_KEY = "adventure-jar:session:v1";
const JAR_PREFIX = "adventure-jar:jar:v1:";
const TITLE_LIMIT = 20;

const appShell = document.getElementById("appShell");
const addButton = document.getElementById("addButton");
const logoutButton = document.getElementById("logoutButton");
const jarMeta = document.getElementById("jarMeta");
const jar = document.getElementById("jar");
const ballLayer = document.getElementById("ballLayer");

const authDialog = document.getElementById("authDialog");
const authForm = document.getElementById("authForm");
const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const authMessage = document.getElementById("authMessage");

const adventureDialog = document.getElementById("adventureDialog");
const adventureForm = document.getElementById("adventureForm");
const cancelAdventureButton = document.getElementById("cancelAdventureButton");
const imageInput = document.getElementById("imageInput");
const imagePreview = document.getElementById("imagePreview");
const titleInput = document.getElementById("titleInput");
const titleCount = document.getElementById("titleCount");
const dateInput = document.getElementById("dateInput");
const adventureMessage = document.getElementById("adventureMessage");

const detailDialog = document.getElementById("detailDialog");
const closeDetailButton = document.getElementById("closeDetailButton");
const detailTitle = document.getElementById("detailTitle");
const detailImage = document.getElementById("detailImage");
const detailDate = document.getElementById("detailDate");
const deleteAdventureButton = document.getElementById("deleteAdventureButton");

let currentUser = null;
let adventures = [];
let selectedAdventureId = null;
let imageDataUrl = "";
let resizeTimer = null;
let engine = null;
let runner = null;
let animationFrame = null;
let ballRecords = new Map();

document.addEventListener("DOMContentLoaded", () => {
  wireEvents();
  setToday();
  updateTitleCount();
  restoreSession();
});

function wireEvents() {
  authForm.addEventListener("submit", handleAuthSubmit);
  authDialog.addEventListener("cancel", (event) => {
    if (!currentUser) {
      event.preventDefault();
    }
  });

  addButton.addEventListener("click", openAdventureDialog);
  logoutButton.addEventListener("click", logout);
  cancelAdventureButton.addEventListener("click", closeAdventureDialog);
  adventureForm.addEventListener("submit", handleAdventureSubmit);
  imageInput.addEventListener("change", handleImageChange);
  titleInput.addEventListener("input", updateTitleCount);

  closeDetailButton.addEventListener("click", () => detailDialog.close());
  deleteAdventureButton.addEventListener("click", deleteSelectedAdventure);

  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(rebuildJar, 160);
  });
}

function restoreSession() {
  const sessionUser = readJson(SESSION_KEY, null);
  const users = readJson(USERS_KEY, {});

  if (sessionUser && users[sessionUser.key]) {
    completeLogin(sessionUser);
    return;
  }

  showAuth();
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  authMessage.textContent = "";

  const rawUsername = usernameInput.value.trim();
  const password = passwordInput.value;
  const userKey = normalizeUsername(rawUsername);

  if (userKey.length < 2) {
    authMessage.textContent = "Use at least 2 username characters.";
    return;
  }

  if (password.length < 4) {
    authMessage.textContent = "Use at least 4 password characters.";
    return;
  }

  const users = readJson(USERS_KEY, {});
  const passwordHash = await hashPassword(userKey, password);

  if (users[userKey] && users[userKey].passwordHash !== passwordHash) {
    authMessage.textContent = "That password does not match this jar.";
    return;
  }

  if (!users[userKey]) {
    users[userKey] = {
      name: rawUsername,
      passwordHash,
      createdAt: new Date().toISOString()
    };

    try {
      writeJson(USERS_KEY, users);
    } catch {
      authMessage.textContent = "This browser could not save that jar.";
      return;
    }
  }

  completeLogin({ key: userKey, name: users[userKey].name });
}

function completeLogin(user) {
  currentUser = user;
  writeJson(SESSION_KEY, user);
  appShell.setAttribute("aria-hidden", "false");
  addButton.disabled = false;
  logoutButton.classList.remove("hidden");
  authForm.reset();
  authMessage.textContent = "";

  if (authDialog.open) {
    authDialog.close();
  }

  adventures = readJson(getJarKey(), []);
  updateMeta();
  rebuildJar();
}

function showAuth() {
  appShell.setAttribute("aria-hidden", "true");
  addButton.disabled = true;
  logoutButton.classList.add("hidden");
  requestAnimationFrame(() => {
    if (!authDialog.open) {
      authDialog.showModal();
    }
    usernameInput.focus();
  });
}

function logout() {
  currentUser = null;
  adventures = [];
  sessionStorage.removeItem(SESSION_KEY);
  stopPhysics();
  ballLayer.innerHTML = "";
  updateMeta();
  showAuth();
}

function openAdventureDialog() {
  if (!currentUser) {
    showAuth();
    return;
  }

  adventureForm.reset();
  imageDataUrl = "";
  imagePreview.style.backgroundImage = "";
  adventureMessage.textContent = "";
  setToday();
  updateTitleCount();
  adventureDialog.showModal();
  titleInput.focus();
}

function closeAdventureDialog() {
  adventureDialog.close();
}

async function handleImageChange() {
  adventureMessage.textContent = "";
  const [file] = imageInput.files;

  if (!file) {
    imageDataUrl = "";
    imagePreview.style.backgroundImage = "";
    return;
  }

  if (!file.type.startsWith("image/")) {
    adventureMessage.textContent = "Choose an image file.";
    imageInput.value = "";
    return;
  }

  try {
    imageDataUrl = await readAndResizeImage(file);
    imagePreview.style.backgroundImage = `url("${imageDataUrl}")`;
  } catch {
    adventureMessage.textContent = "That image could not be loaded.";
    imageInput.value = "";
  }
}

async function handleAdventureSubmit(event) {
  event.preventDefault();
  adventureMessage.textContent = "";

  const title = cleanTitle(titleInput.value);
  const date = dateInput.value;

  if (!imageDataUrl) {
    adventureMessage.textContent = "Choose an image.";
    return;
  }

  if (!title) {
    adventureMessage.textContent = "Add a title.";
    return;
  }

  if (!date) {
    adventureMessage.textContent = "Choose a date.";
    return;
  }

  const adventure = {
    id: createId(),
    title,
    date,
    image: imageDataUrl,
    createdAt: new Date().toISOString()
  };

  adventures.push(adventure);

  if (!saveAdventures()) {
    adventures = adventures.filter((item) => item.id !== adventure.id);
    adventureMessage.textContent = "This browser is out of space for images.";
    return;
  }

  updateMeta();
  adventureDialog.close();
  rebuildJar();
}

function updateTitleCount() {
  if (titleInput.value.length > TITLE_LIMIT) {
    titleInput.value = titleInput.value.slice(0, TITLE_LIMIT);
  }
  titleCount.textContent = `${titleInput.value.length}/${TITLE_LIMIT}`;
}

function cleanTitle(value) {
  return value.trim().replace(/\s+/g, " ").slice(0, TITLE_LIMIT);
}

function setToday() {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60000;
  dateInput.value = new Date(today.getTime() - offset).toISOString().slice(0, 10);
}

function saveAdventures() {
  if (!currentUser) {
    return false;
  }

  try {
    writeJson(getJarKey(), adventures);
    return true;
  } catch {
    return false;
  }
}

function getJarKey() {
  return `${JAR_PREFIX}${currentUser.key}`;
}

function updateMeta() {
  const count = adventures.length;
  const noun = count === 1 ? "adventure" : "adventures";
  const owner = currentUser ? ` for ${currentUser.name}` : "";
  jarMeta.textContent = `${count} ${noun}${owner}`;
}

function rebuildJar() {
  stopPhysics();
  ballLayer.innerHTML = "";

  const width = jar.clientWidth;
  const height = jar.clientHeight;

  if (!width || !height || !currentUser) {
    return;
  }

  const radius = getBallRadius(width);

  if (!window.Matter) {
    layoutWithoutPhysics(width, height, radius);
    return;
  }

  setupPhysics(width, height, radius);
}

function setupPhysics(width, height, radius) {
  const MatterLib = window.Matter;
  const { Engine, Runner, Bodies, Body, Composite } = MatterLib;
  const wall = Math.max(56, radius * 1.5);

  engine = Engine.create();
  engine.gravity.y = 0.92;
  runner = Runner.create();
  ballRecords = new Map();

  const staticOptions = {
    isStatic: true,
    restitution: 0.05,
    friction: 0.6
  };

  const boundaries = [
    Bodies.rectangle(width / 2, height + wall * 0.38, width * 0.86, wall, staticOptions),
    Bodies.rectangle(width * 0.06, height * 0.61, wall, height * 0.75, { ...staticOptions, angle: -0.08 }),
    Bodies.rectangle(width * 0.94, height * 0.61, wall, height * 0.75, { ...staticOptions, angle: 0.08 }),
    Bodies.rectangle(width * 0.31, height * 0.1, wall, height * 0.22, staticOptions),
    Bodies.rectangle(width * 0.69, height * 0.1, wall, height * 0.22, staticOptions),
    Bodies.rectangle(width * 0.22, height * 0.24, width * 0.33, wall, { ...staticOptions, angle: -0.68 }),
    Bodies.rectangle(width * 0.78, height * 0.24, width * 0.33, wall, { ...staticOptions, angle: 0.68 })
  ];

  Composite.add(engine.world, boundaries);

  adventures.forEach((adventure, index) => {
    const element = createBallElement(adventure, radius);
    const spread = (Math.random() - 0.5) * radius * 1.2;
    const body = Bodies.circle(width / 2 + spread, radius + index * 2, radius, {
      restitution: 0.18,
      friction: 0.28,
      frictionAir: 0.012,
      density: 0.0025,
      label: adventure.id
    });

    Body.setInertia(body, Infinity);
    Composite.add(engine.world, body);
    ballRecords.set(adventure.id, { body, element, radius });
  });

  Runner.run(runner, engine);
  animationFrame = requestAnimationFrame(renderPhysics);
}

function renderPhysics() {
  if (!engine) {
    return;
  }

  const { Body } = window.Matter;
  const width = jar.clientWidth;
  const height = jar.clientHeight;

  ballRecords.forEach((record) => {
    const { body, element, radius } = record;

    if (body.position.y > height + radius * 5) {
      Body.setPosition(body, { x: width / 2, y: radius });
      Body.setVelocity(body, { x: 0, y: 0 });
    }

    Body.setAngle(body, 0);
    Body.setAngularVelocity(body, 0);
    element.style.transform = `translate3d(${body.position.x - radius}px, ${body.position.y - radius}px, 0)`;
  });

  animationFrame = requestAnimationFrame(renderPhysics);
}

function stopPhysics() {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  if (runner && window.Matter) {
    window.Matter.Runner.stop(runner);
  }

  if (engine && window.Matter) {
    window.Matter.Composite.clear(engine.world, false);
    window.Matter.Engine.clear(engine);
  }

  engine = null;
  runner = null;
  ballRecords = new Map();
}

function layoutWithoutPhysics(width, height, radius) {
  const usableWidth = width * 0.78;
  const left = width * 0.11;
  const diameter = radius * 2;
  const columns = Math.max(2, Math.floor(usableWidth / (diameter * 0.92)));

  adventures.forEach((adventure, index) => {
    const element = createBallElement(adventure, radius);
    const row = Math.floor(index / columns);
    const col = index % columns;
    const xGap = usableWidth / columns;
    const x = left + xGap * col + xGap / 2 - radius;
    const y = height - diameter - row * diameter * 0.82 - 8;
    element.style.transform = `translate3d(${x}px, ${Math.max(radius, y)}px, 0)`;
  });
}

function createBallElement(adventure, radius) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "adventure-ball";
  button.style.setProperty("--ball-size", `${radius * 2}px`);
  button.setAttribute("aria-label", `${adventure.title}, ${formatDate(adventure.date)}`);
  button.innerHTML = `
    <span class="ball-image"></span>
    <span class="ball-tint"></span>
    <span class="ball-label">
      <span class="ball-title"></span>
      <span class="ball-date"></span>
    </span>
  `;

  button.querySelector(".ball-image").style.backgroundImage = `url("${adventure.image}")`;
  button.querySelector(".ball-title").textContent = adventure.title;
  button.querySelector(".ball-date").textContent = formatShortDate(adventure.date);
  button.addEventListener("click", () => openDetail(adventure.id));
  ballLayer.appendChild(button);
  return button;
}

function getBallRadius(width) {
  if (width < 360) {
    return 34;
  }
  if (width < 520) {
    return 40;
  }
  if (width < 700) {
    return 48;
  }
  return 54;
}

function openDetail(id) {
  const adventure = adventures.find((item) => item.id === id);
  if (!adventure) {
    return;
  }

  selectedAdventureId = id;
  detailTitle.textContent = adventure.title;
  detailDate.textContent = formatDate(adventure.date);
  detailImage.style.backgroundImage = `url("${adventure.image}")`;
  detailDialog.showModal();
}

function deleteSelectedAdventure() {
  if (!selectedAdventureId) {
    return;
  }

  adventures = adventures.filter((adventure) => adventure.id !== selectedAdventureId);
  selectedAdventureId = null;
  saveAdventures();
  updateMeta();
  detailDialog.close();
  rebuildJar();
}

function formatDate(value) {
  const date = parseLocalDate(value);
  if (!date) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatShortDate(value) {
  const date = parseLocalDate(value);
  if (!date) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(date);
}

function parseLocalDate(value) {
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return null;
  }
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function readAndResizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resizeImage(reader.result).then(resolve).catch(reject);
    reader.readAsDataURL(file);
  });
}

function resizeImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const maxSide = 720;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function hashPassword(username, password) {
  const payload = `adventure-jar:${username}:${password}`;

  if (!window.crypto?.subtle) {
    return simpleHash(payload);
  }

  const bytes = new TextEncoder().encode(payload);
  const buffer = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function simpleHash(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return `fallback-${Math.abs(hash)}`;
}

function normalizeUsername(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  const raw = JSON.stringify(value);

  if (key === SESSION_KEY) {
    sessionStorage.setItem(key, raw);
    return;
  }

  localStorage.setItem(key, raw);
}
