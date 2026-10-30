const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'mz-tech-hub';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

const ROOT = __dirname;
let ordersCollection;
let usersCollection;
let inventoryCollection;
let inventoryChangesCollection;
let manualSalesCollection;
let productsCollection;
const scrypt = promisify(crypto.scrypt);
const adminSessions = new Map();
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
let products = [
    { id: 'everyday-case', name: 'Everyday Case', category: 'cases', price: 29 },
    { id: 'snap-wallet', name: 'Snap Wallet', category: 'cases', price: 34 },
    { id: 'cloud-buds', name: 'Cloud Buds', category: 'audio', price: 79 },
    { id: 'pocket-power', name: 'Pocket Power', category: 'power', price: 45 },
    { id: 'halo-shell', name: 'Halo Shell', category: 'cases', price: 39 },
    { id: 'ledger-sleeve', name: 'Ledger Sleeve', category: 'cases', price: 42 },
    { id: 'orbit-speaker', name: 'Orbit Speaker', category: 'audio', price: 59 },
    { id: 'aural-mini', name: 'Aural Mini', category: 'audio', price: 69 },
    { id: 'grid-charger', name: 'Grid Charger', category: 'power', price: 64 },
    { id: 'travel-bank', name: 'Travel Bank', category: 'power', price: 89 },
    { id: 'lumen-case', name: 'Lumen Case', category: 'cases', price: 32 },
    { id: 'terra-grip', name: 'Terra Grip', category: 'cases', price: 36 },
    { id: 'studio-loop', name: 'Studio Loop', category: 'audio', price: 99 },
    { id: 'mini-mic', name: 'Mini Mic', category: 'audio', price: 74 },
    { id: 'magnetic-pad', name: 'Magnetic Pad', category: 'power', price: 49 },
    { id: 'desk-dock', name: 'Desk Dock', category: 'power', price: 72 },
    { id: 'pulse-smartwatch', name: 'Pulse Smartwatch', category: 'wearables', price: 129 },
    { id: 'studio-keyboard', name: 'Studio Keyboard', category: 'workspace', price: 59 }
];

const productByName = new Map();
const productById = new Map();
const ORDER_STATUSES = new Set(['received', 'processing', 'shipped', 'delivered', 'cancelled']);
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function replaceProducts(nextProducts) {
    products = nextProducts;
    productById.clear();
    productByName.clear();
    for (const product of products) {
        productById.set(product.id, product);
        productByName.set(product.name.toLowerCase(), product);
    }
}

replaceProducts(products);

function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
    });
    response.end(JSON.stringify(payload));
}

function readJson(request) {
    return new Promise((resolve, reject) => {
        let body = '';
        request.on('data', chunk => {
            body += chunk;
            if (body.length > 1_000_000) request.destroy();
        });
        request.on('end', () => {
            try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Request body must be valid JSON.')); }
        });
        request.on('error', reject);
    });
}

function getProduct(item) {
    if (!item || typeof item !== 'object') return null;
    return productById.get(item.id) || productByName.get(String(item.name || '').trim().toLowerCase());
}

function validateCustomer(customer) {
    if (!customer || typeof customer !== 'object' || Array.isArray(customer)) throw new Error('Customer details must be an object.');
    const name = String(customer.name || '').trim();
    const email = String(customer.email || '').trim().toLowerCase();
    if (name.length < 2 || name.length > 80) throw new Error('Please provide a valid customer name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) throw new Error('Please provide a valid customer email.');
    return { name, email };
}

function validateCredentials(payload, requireName) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('Account details must be an object.');
    }
    const name = String(payload.name || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const password = typeof payload.password === 'string' ? payload.password : '';

    if (requireName && (name.length < 2 || name.length > 80)) {
        throw new Error('Please provide a valid name.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
        throw new Error('Please provide a valid email address.');
    }
    if (password.length < 8 || password.length > 128) {
        throw new Error('Password must be between 8 and 128 characters.');
    }
    return { name, email, password };
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = await scrypt(password, salt, 64);
    return { salt, hash: hash.toString('hex') };
}

async function verifyPassword(password, salt, expectedHash) {
    const actualHash = await scrypt(password, salt, 64);
    const storedHash = Buffer.from(expectedHash, 'hex');
    return actualHash.length === storedHash.length && crypto.timingSafeEqual(actualHash, storedHash);
}

function publicUser(user) {
    return { name: user.name, email: user.email };
}

function validProductId(productId) {
    return typeof productId === 'string' ? productById.get(productId) : null;
}

function validateProduct(payload, partial = false) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('Product details must be an object.');
    }
    const allowedFields = partial ? ['name', 'category', 'price'] : ['id', 'name', 'category', 'price'];
    if (Object.keys(payload).some(field => !allowedFields.includes(field))) {
        throw new Error(`Only ${allowedFields.join(', ')} can be provided.`);
    }
    if (!partial && (typeof payload.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.id))) {
        throw new Error('Product ID must be a lowercase slug using letters, numbers, and hyphens.');
    }
    const product = {};
    for (const field of ['name', 'category', 'price']) {
        if (partial && !Object.hasOwn(payload, field)) continue;
        const value = payload[field];
        if (field === 'name') {
            const name = typeof value === 'string' ? value.trim() : '';
            if (name.length < 2 || name.length > 80) throw new Error('Product name must be between 2 and 80 characters.');
            product.name = name;
        } else if (field === 'category') {
            const category = typeof value === 'string' ? value.trim().toLowerCase() : '';
            if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category) || category.length > 40) {
                throw new Error('Product category must be a lowercase slug of at most 40 characters.');
            }
            product.category = category;
        } else {
            const price = Number(value);
            if (!Number.isFinite(price) || price <= 0 || price > 1000000 || Math.round(price * 100) !== price * 100) {
                throw new Error('Product price must be a positive amount with at most two decimal places.');
            }
            product.price = price;
        }
    }
    if (!partial && (!Object.hasOwn(product, 'name') || !Object.hasOwn(product, 'category') || !Object.hasOwn(product, 'price'))) {
        throw new Error('Product name, category, and price are required.');
    }
    if (partial && Object.keys(product).length === 0) throw new Error('Provide at least one product field to update.');
    if (!partial) product.id = payload.id;
    return product;
}

function createManualSale(payload) {
    const { items, note } = payload || {};
    if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
        throw new Error('Provide between 1 and 100 sale items.');
    }
    const lineItems = items.map(item => {
        const product = item && typeof item === 'object' ? validProductId(item.productId) : null;
        const quantity = Number(item && item.quantity);
        if (!product || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 9999) {
            throw new Error('One or more sale items are invalid.');
        }
        return { ...product, quantity, lineTotal: product.price * quantity };
    });
    const cleanNote = typeof note === 'string' ? note.trim() : '';
    if (cleanNote.length > 500) throw new Error('Sale note must be 500 characters or fewer.');
    return {
        id: `MS-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
        items: lineItems,
        total: lineItems.reduce((sum, item) => sum + item.lineTotal, 0),
        note: cleanNote,
        createdAt: new Date().toISOString()
    };
}

function getDateRange(date) {
    const value = date || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
        throw new Error('Date must use YYYY-MM-DD format.');
    }
    const start = new Date(`${value}T00:00:00.000Z`);
    if (start.toISOString().slice(0, 10) !== value) throw new Error('Please provide a valid calendar date.');
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { date: value, start: start.toISOString(), end: end.toISOString() };
}

function getDateInterval(from, to) {
    if (!from || !to) throw new Error('Both from and to dates are required in YYYY-MM-DD format.');
    const start = getDateRange(from);
    const lastDay = getDateRange(to);
    const dayCount = (Date.parse(lastDay.start) - Date.parse(start.start)) / 86400000 + 1;
    if (dayCount < 1) throw new Error('The from date must be on or before the to date.');
    if (dayCount > 366) throw new Error('Date range cannot exceed 366 days.');
    return { from: start.date, to: lastDay.date, start: start.start, end: lastDay.end };
}

function getAdminSession(request) {
    const authorization = request.headers.authorization || '';
    const match = /^Bearer ([a-f0-9]{64})$/i.exec(authorization);
    if (!match) return null;
    const expiresAt = adminSessions.get(match[1]);
    if (!expiresAt || expiresAt <= Date.now()) {
        adminSessions.delete(match[1]);
        return null;
    }
    return match[1];
}

function createOrder(payload) {
    const { items, customer } = payload || {};
    if (!Array.isArray(items) || items.length === 0) throw new Error('Your cart is empty.');
    const lineItems = items.map(item => {
        const product = item && typeof item === 'object' ? getProduct(item) : null;
        const quantity = Number(item.quantity);
        if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error('One or more cart items are invalid.');
        return { ...product, quantity, lineTotal: product.price * quantity };
    });
    const total = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
    return {
        id: `MS-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
        customer: validateCustomer(customer),
        items: lineItems,
        total,
        status: 'received',
        createdAt: new Date().toISOString()
    };
}

function serveFile(request, response) {
    let requestedPath;
    try {
        requestedPath = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
    } catch {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Invalid URL');
        return;
    }
    if (requestedPath === '/') requestedPath = '/index.html';
    if (requestedPath === '/admin' || requestedPath === '/admin/') requestedPath = '/admin.html';
    const filePath = path.normalize(path.join(ROOT, requestedPath));
    if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
    }
    response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer(async (request, response) => {
    try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (request.method === 'OPTIONS') {
        response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' });
        response.end();
        return;
    }
    if (url.pathname === '/api/health' && request.method === 'GET') {
        return sendJson(response, 200, { status: 'ok', service: 'mz-tech-hub', timestamp: new Date().toISOString() });
    }
    if (url.pathname === '/api/products' && request.method === 'GET') return sendJson(response, 200, { products, total: products.length });
    if (url.pathname.startsWith('/api/products/') && request.method === 'GET') {
        const product = productById.get(url.pathname.slice('/api/products/'.length));
        return product ? sendJson(response, 200, { product }) : sendJson(response, 404, { error: 'Product not found.' });
    }
    if (url.pathname === '/api/admin/login' && request.method === 'POST') {
        if (!ADMIN_EMAIL) return sendJson(response, 503, { error: 'Admin sign-in is not configured. Set ADMIN_EMAIL in .env.' });
        let credentials;
        try {
            credentials = validateCredentials(await readJson(request), false);
        } catch (error) {
            return sendJson(response, 400, { error: error.message });
        }

        try {
            const user = await usersCollection.findOne({ email: ADMIN_EMAIL });
            if (!user || credentials.email !== ADMIN_EMAIL ||
                !(await verifyPassword(credentials.password, user.passwordSalt, user.passwordHash))) {
                return sendJson(response, 401, { error: 'Invalid admin email or password.' });
            }
            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
            adminSessions.set(token, expiresAt);
            return sendJson(response, 200, {
                message: 'Admin signed in successfully.',
                token,
                expiresAt: new Date(expiresAt).toISOString(),
                user: publicUser(user)
            });
        } catch (error) {
            console.error(`Unable to sign in admin: ${error.message}`);
            return sendJson(response, 500, { error: 'Unable to sign in right now.' });
        }
    }
    if (url.pathname.startsWith('/api/admin/')) {
        if (!getAdminSession(request)) return sendJson(response, 401, { error: 'Admin sign-in is required.' });

        if (url.pathname === '/api/admin/products' && request.method === 'GET') {
            return sendJson(response, 200, { products, total: products.length });
        }
        if (url.pathname === '/api/admin/products' && request.method === 'POST') {
            let product;
            try {
                product = validateProduct(await readJson(request));
            } catch (error) {
                return sendJson(response, 400, { error: error.message });
            }
            if (productById.has(product.id)) return sendJson(response, 409, { error: 'A product with this ID already exists.' });
            if (products.some(existing => existing.name.toLowerCase() === product.name.toLowerCase())) {
                return sendJson(response, 409, { error: 'A product with this name already exists.' });
            }

            try {
                const now = new Date().toISOString();
                await inventoryCollection.updateOne(
                    { productId: product.id },
                    { $setOnInsert: { productId: product.id, quantity: 0, updatedAt: now } },
                    { upsert: true }
                );
                await productsCollection.insertOne({ ...product, active: true, createdAt: now, updatedAt: now });
                replaceProducts([...products, product]);
                return sendJson(response, 201, { message: 'Product created successfully.', product });
            } catch (error) {
                if (error.code === 11000) return sendJson(response, 409, { error: 'A product with this ID already exists.' });
                console.error(`Unable to create product: ${error.message}`);
                return sendJson(response, 500, { error: 'Unable to create product right now.' });
            }
        }
        const productPath = url.pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
        if (productPath && request.method === 'PATCH') {
            const productId = productPath[1];
            let updates;
            try {
                updates = validateProduct(await readJson(request), true);
            } catch (error) {
                return sendJson(response, 400, { error: error.message });
            }
            if (!productById.has(productId)) return sendJson(response, 404, { error: 'Product not found.' });
            if (updates.name && products.some(product =>
                product.id !== productId && product.name.toLowerCase() === updates.name.toLowerCase())) {
                return sendJson(response, 409, { error: 'A product with this name already exists.' });
            }

            try {
                const updated = await productsCollection.findOneAndUpdate(
                    { id: productId, active: { $ne: false } },
                    { $set: { ...updates, updatedAt: new Date().toISOString() } },
                    { returnDocument: 'after' }
                );
                if (!updated) return sendJson(response, 404, { error: 'Product not found.' });
                const product = { id: updated.id, name: updated.name, category: updated.category, price: updated.price };
                replaceProducts(products.map(existing => existing.id === productId ? product : existing));
                return sendJson(response, 200, { message: 'Product updated successfully.', product });
            } catch (error) {
                if (error.code === 11000) return sendJson(response, 409, { error: 'A product with this name already exists.' });
                console.error(`Unable to update product: ${error.message}`);
                return sendJson(response, 500, { error: 'Unable to update product right now.' });
            }
        }
        if (productPath && request.method === 'DELETE') {
            const productId = productPath[1];
            const product = productById.get(productId);
            if (!product) return sendJson(response, 404, { error: 'Product not found.' });

            try {
                const inventory = await inventoryCollection.findOne({ productId });
                if (inventory && inventory.quantity > 0) {
                    return sendJson(response, 409, { error: 'Reduce this product stock to zero before removing it.' });
                }
                const result = await productsCollection.updateOne(
                    { id: productId, active: { $ne: false } },
                    { $set: { active: false, updatedAt: new Date().toISOString() } }
                );
                if (!result.matchedCount) return sendJson(response, 404, { error: 'Product not found.' });
                replaceProducts(products.filter(existing => existing.id !== productId));
                return sendJson(response, 200, { message: 'Product removed successfully.', product });
            } catch (error) {
                console.error(`Unable to remove product: ${error.message}`);
                return sendJson(response, 500, { error: 'Unable to remove product right now.' });
            }
        }
        if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
            const limit = Number(url.searchParams.get('limit') || 50);
            const offset = Number(url.searchParams.get('offset') || 0);
            const status = url.searchParams.get('status');
            const email = url.searchParams.get('email');
            const from = url.searchParams.get('from');
            const to = url.searchParams.get('to');
            if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
                !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) {
                return sendJson(response, 400, { error: 'Limit must be 1–100 and offset must be between 0 and 1,000,000.' });
            }
            if (status && !ORDER_STATUSES.has(status)) {
                return sendJson(response, 400, { error: `Status must be one of: ${[...ORDER_STATUSES].join(', ')}.` });
            }
            const query = {};
            if (status) query.status = status;
            if (email) query['customer.email'] = { $regex: `^${email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
            if (from || to) {
                try {
                    const range = getDateInterval(from, to);
                    query.createdAt = { $gte: range.start, $lt: range.end };
                } catch (error) {
                    return sendJson(response, 400, { error: error.message });
                }
            }

            try {
                const [orders, total] = await Promise.all([
                    ordersCollection.find(query).sort({ createdAt: -1 }).skip(offset).limit(limit).toArray(),
                    ordersCollection.countDocuments(query)
                ]);
                return sendJson(response, 200, { orders, total, limit, offset });
            } catch (error) {
                console.error(`Unable to load admin orders: ${error.message}`);
                return sendJson(response, 500, { error: 'Unable to load orders right now.' });
            }
        }
        const orderStatusPath = url.pathname.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
        if (orderStatusPath && request.method === 'PATCH') {
            let payload;
            try {
                payload = await readJson(request);
            } catch (error) {
                return sendJson(response, 400, { error: error.message });
            }
            const status = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload.status : null;
            if (typeof status !== 'string' || !ORDER_STATUSES.has(status)) {
                return sendJson(response, 400, { error: `Status must be one of: ${[...ORDER_STATUSES].join(', ')}.` });
            }
            try {
                const order = await ordersCollection.findOneAndUpdate(
                    { id: orderStatusPath[1] },
                    { $set: { status, updatedAt: new Date().toISOString() } },
                    { returnDocument: 'after' }
                );
                return order
                    ? sendJson(response, 200, { message: 'Order status updated successfully.', order })
                    : sendJson(response, 404, { error: 'Order not found.' });
            } catch (error) {
                console.error(`Unable to update order status: ${error.message}`);
                return sendJson(response, 500, { error: 'Unable to update order right now.' });
            }
        }
        const orderPath = url.pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
        if (orderPath && request.method === 'GET') {
            try {
                const order = await ordersCollection.findOne({ id: orderPath[1] });
                return order
                    ? sendJson(response, 200, { order })
                    : sendJson(response, 404, { error: 'Order not found.' });
            } catch (error) {
                console.error(`Unable to load admin order: ${error.message}`);
                return sendJson(response, 500, { error: 'Unable to load this order right now.' });
            }
        }
        if (url.pathname === '/api/admin/inventory' && request.method === 'GET') {
            try {
                const inventory = await inventoryCollection.find().toArray();
                const quantities = new Map(inventory.map(item => [item.productId, item.quantity]));
                return sendJson(response, 200, {
                    inventory: products.map(product => ({ ...product, quantity: quantities.get(product.id) || 0 }))
                });
            } catch (error) {
                console.error(`Unable to load inventory: ${error.message}`);
                return sendJson(response, 500, { error: 'Unable to load inventory right now.' });
            }
        }
        if (url.pathname === '/api/admin/inventory/adjust' && request.method === 'POST') {
            let payload;
            try {
                payload = await readJson(request);
            } catch (error) {
                return sendJson(response, 400, { error: error.message });
            }
            const adjustment = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
            const product = validProductId(adjustment.productId);
            const quantityChange = Number(adjustment.quantityChange);
            const reason = typeof adjustment.reason === 'string' ? adjustment.reason.trim() : '';
            if (!product || !Number.isSafeInteger(quantityChange) || quantityChange === 0 ||
                Math.abs(quantityChange) > 1000000 || reason.length > 240) {
                return sendJson(response, 400, { error: 'Provide a valid product, non-zero stock change, and reason of at most 240 characters.' });
            }

            try {
                const updatedInventory = await inventoryCollection.findOneAndUpdate(
                    { productId: product.id, quantity: { $gte: -quantityChange } },
                    { $inc: { quantity: quantityChange }, $set: { updatedAt: new Date().toISOString() } },
                    { returnDocument: 'after' }
                );
                if (!updatedInventory) return sendJson(response, 409, { error: 'Stock cannot be reduced below zero.' });

                const change = {
                    id: `ST-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
                    productId: product.id,
                    productName: product.name,
                    quantityChange,
                    resultingQuantity: updatedInventory.quantity,
                    reason: reason || 'Manual stock adjustment',
                    createdAt: new Date().toISOString()
                };
                await inventoryChangesCollection.insertOne(change);
                return sendJson(response, 201, { message: 'Inventory updated successfully.', inventory: { ...product, quantity: updatedInventory.quantity }, change });
            } catch (error) {
                console.error(`Unable to update inventory: ${error.message}`);
                return sendJson(response, 500, { error: 'Unable to update inventory right now.' });
            }
        }
        if (url.pathname === '/api/admin/inventory/changes' && request.method === 'GET') {
            const requestedLimit = Number(url.searchParams.get('limit') || 50);
            if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
                return sendJson(response, 400, { error: 'Limit must be an integer between 1 and 100.' });
            }
            try {
                const changes = await inventoryChangesCollection.find().sort({ createdAt: -1 }).limit(requestedLimit).toArray();
                return sendJson(response, 200, { changes });
            } catch (error) {
                console.error(`Unable to load inventory changes: ${error.message}`);
                return sendJson(response, 500, { error: 'Unable to load inventory changes right now.' });
            }
        }
        if (url.pathname === '/api/admin/sales' && request.method === 'POST') {
            let sale;
            try {
                sale = createManualSale(await readJson(request));
            } catch (error) {
                return sendJson(response, 400, { error: error.message });
            }
            try {
                await manualSalesCollection.insertOne(sale);
                return sendJson(response, 201, { message: 'Manual sale recorded successfully.', sale });
            } catch (error) {
                console.error(`Unable to record manual sale: ${error.message}`);
                return sendJson(response, 500, { error: 'Unable to record this sale right now.' });
            }
        }
        if (url.pathname === '/api/admin/sales/daily' && request.method === 'GET') {
            let range;
            try {
                range = getDateRange(url.searchParams.get('date'));
            } catch (error) {
                return sendJson(response, 400, { error: error.message });
            }
            try {
                const sales = await manualSalesCollection.find({
                    createdAt: { $gte: range.start, $lt: range.end }
                }).sort({ createdAt: -1 }).toArray();
                const itemCount = sales.reduce((count, sale) => count + sale.items.reduce((sum, item) => sum + item.quantity, 0), 0);
                const total = sales.reduce((sum, sale) => sum + sale.total, 0);
                return sendJson(response, 200, { date: range.date, saleCount: sales.length, itemCount, total, sales });
            } catch (error) {
                console.error(`Unable to load daily sales: ${error.message}`);
                return sendJson(response, 500, { error: 'Unable to load daily sales right now.' });
            }
        }
        if (url.pathname === '/api/admin/sales/report' && request.method === 'GET') {
            let range;
            try {
                range = getDateInterval(url.searchParams.get('from'), url.searchParams.get('to'));
            } catch (error) {
                return sendJson(response, 400, { error: error.message });
            }
            try {
                const [report] = await manualSalesCollection.aggregate([
                    { $match: { createdAt: { $gte: range.start, $lt: range.end } } },
                    {
                        $facet: {
                            summary: [{ $group: { _id: null, saleCount: { $sum: 1 }, total: { $sum: '$total' } } }],
                            items: [
                                { $unwind: '$items' },
                                { $group: { _id: null, itemCount: { $sum: '$items.quantity' } } }
                            ],
                            byProduct: [
                                { $unwind: '$items' },
                                {
                                    $group: {
                                        _id: { productId: '$items.id', name: '$items.name' },
                                        quantity: { $sum: '$items.quantity' },
                                        revenue: { $sum: '$items.lineTotal' }
                                    }
                                },
                                {
                                    $project: {
                                        _id: 0,
                                        productId: '$_id.productId',
                                        name: '$_id.name',
                                        quantity: 1,
                                        revenue: 1
                                    }
                                },
                                { $sort: { revenue: -1, name: 1 } }
                            ]
                        }
                    }
                ]).toArray();
                const summary = report.summary[0] || { saleCount: 0, total: 0 };
                const itemTotals = report.items[0] || { itemCount: 0 };
                return sendJson(response, 200, {
                    from: range.from,
                    to: range.to,
                    saleCount: summary.saleCount,
                    itemCount: itemTotals.itemCount,
                    total: summary.total,
                    byProduct: report.byProduct
                });
            } catch (error) {
                console.error(`Unable to load sales report: ${error.message}`);
                return sendJson(response, 500, { error: 'Unable to load the sales report right now.' });
            }
        }
        return sendJson(response, 404, { error: 'Admin endpoint not found.' });
    }
    if (url.pathname === '/api/auth/register' && request.method === 'POST') {
        let account;
        try {
            account = validateCredentials(await readJson(request), true);
        } catch (error) {
            return sendJson(response, 400, { error: error.message });
        }

        try {
            const { salt, hash } = await hashPassword(account.password);
            const user = {
                name: account.name,
                email: account.email,
                passwordSalt: salt,
                passwordHash: hash,
                createdAt: new Date().toISOString()
            };
            await usersCollection.insertOne(user);
            return sendJson(response, 201, { message: 'Account created successfully.', user: publicUser(user) });
        } catch (error) {
            if (error.code === 11000) return sendJson(response, 409, { error: 'An account with this email already exists.' });
            console.error(`Unable to create account: ${error.message}`);
            return sendJson(response, 500, { error: 'Unable to create account right now.' });
        }
    }
    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        let credentials;
        try {
            credentials = validateCredentials(await readJson(request), false);
        } catch (error) {
            return sendJson(response, 400, { error: error.message });
        }

        try {
            const user = await usersCollection.findOne({ email: credentials.email });
            if (!user || !(await verifyPassword(credentials.password, user.passwordSalt, user.passwordHash))) {
                return sendJson(response, 401, { error: 'Invalid email or password.' });
            }
            return sendJson(response, 200, { message: 'Signed in successfully.', user: publicUser(user) });
        } catch (error) {
            console.error(`Unable to sign in: ${error.message}`);
            return sendJson(response, 500, { error: 'Unable to sign in right now.' });
        }
    }
    if (url.pathname === '/api/orders' && request.method === 'POST') {
        try {
            const order = createOrder(await readJson(request));
            await ordersCollection.insertOne(order);
            return sendJson(response, 201, { message: 'Order created successfully.', order });
        } catch (error) {
            return sendJson(response, 400, { error: error.message });
        }
    }
    if (url.pathname === '/api/orders/track' && request.method === 'POST') {
        let lookup;
        try {
            lookup = await readJson(request);
        } catch (error) {
            return sendJson(response, 400, { error: error.message });
        }
        const orderId = typeof lookup?.orderId === 'string' ? lookup.orderId.trim().toUpperCase() : '';
        const email = typeof lookup?.email === 'string' ? lookup.email.trim().toLowerCase() : '';
        if (!/^MS-[A-F0-9]{6}$/.test(orderId)) {
            return sendJson(response, 400, { error: 'Please provide a valid order number.' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
            return sendJson(response, 400, { error: 'Please provide the valid checkout email.' });
        }
        try {
            const order = await ordersCollection.findOne({ id: orderId, 'customer.email': email });
            if (!order) return sendJson(response, 404, { error: 'We could not find an order matching those details.' });
            return sendJson(response, 200, {
                order: {
                    id: order.id,
                    status: order.status,
                    createdAt: order.createdAt,
                    total: order.total,
                    items: order.items.map(item => ({
                        name: item.name,
                        quantity: item.quantity,
                        lineTotal: item.lineTotal
                    }))
                }
            });
        } catch (error) {
            console.error(`Unable to track order: ${error.message}`);
            return sendJson(response, 500, { error: 'Unable to look up your order right now.' });
        }
    }
    if (url.pathname.startsWith('/api/orders/') && request.method === 'GET') {
        const order = await ordersCollection.findOne({ id: url.pathname.slice('/api/orders/'.length) });
        return order ? sendJson(response, 200, { order }) : sendJson(response, 404, { error: 'Order not found.' });
    }
    if (url.pathname === '/api/orders' && request.method === 'GET') {
        const orders = await ordersCollection.find().sort({ createdAt: -1 }).toArray();
        return sendJson(response, 200, { orders });
    }
    if (request.method === 'GET') return serveFile(request, response);
    sendJson(response, 405, { error: 'Method not allowed.' });
    } catch (error) {
        console.error(`Unable to handle ${request.method} ${request.url}: ${error.message}`);
        if (response.headersSent) {
            response.destroy(error);
            return;
        }
        sendJson(response, 500, { error: 'The server could not complete this request. Please try again.' });
    }
});

async function startServer() {
    if (!MONGODB_URI) throw new Error('MONGODB_URI is missing. Add your MongoDB connection string to .env.');
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const database = client.db(MONGODB_DB);
    ordersCollection = database.collection('orders');
    usersCollection = database.collection('users');
    inventoryCollection = database.collection('inventory');
    inventoryChangesCollection = database.collection('inventory_changes');
    manualSalesCollection = database.collection('manual_sales');
    productsCollection = database.collection('products');
    await ordersCollection.createIndex({ id: 1 }, { unique: true });
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    await inventoryCollection.createIndex({ productId: 1 }, { unique: true });
    await inventoryChangesCollection.createIndex({ createdAt: -1 });
    await manualSalesCollection.createIndex({ createdAt: -1 });
    await productsCollection.createIndex({ id: 1 }, { unique: true });
    const seededAt = new Date().toISOString();
    await productsCollection.bulkWrite(products.map(product => ({
        updateOne: {
            filter: { id: product.id },
            update: {
                $setOnInsert: {
                    ...product,
                    active: true,
                    createdAt: seededAt,
                    updatedAt: seededAt
                }
            },
            upsert: true
        }
    })));
    const storedProducts = await productsCollection.find({ active: { $ne: false } }).toArray();
    replaceProducts(storedProducts.map(({ id, name, category, price }) => ({ id, name, category, price })));
    await inventoryCollection.bulkWrite(products.map(product => ({
        updateOne: {
            filter: { productId: product.id },
            update: { $setOnInsert: { productId: product.id, quantity: 0, updatedAt: new Date().toISOString() } },
            upsert: true
        }
    })));
    server.listen(PORT, HOST, () => console.log(`MZ Tech Hub backend running at http://${HOST}:${PORT}`));
}

startServer().catch(error => {
    console.error(`Unable to start the server: ${error.message}`);
    process.exitCode = 1;
});
