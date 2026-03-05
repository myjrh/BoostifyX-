// script.js

// ===== Global variables =====
let currentUser = null;
let currentUserId = null;

// ===== Theme toggle =====
document.addEventListener('DOMContentLoaded', () => {
    const themeSwitch = document.getElementById('themeSwitch');
    if (themeSwitch) {
        themeSwitch.addEventListener('click', () => {
            document.body.classList.toggle('light-theme');
            document.body.classList.toggle('dark-theme');
        });
    }

    // Initialize auth state observer
    auth.onAuthStateChanged(user => {
        currentUser = user;
        if (user) {
            // User is signed in
            currentUserId = user.uid;
            // Load user data if on dashboard
            if (window.location.pathname.includes('dashboard.html')) {
                loadDashboardData();
            } else if (window.location.pathname.includes('deposit.html')) {
                // Check if user is logged in, otherwise redirect
                if (!user) window.location.href = 'login.html';
            }
        } else {
            // No user, redirect to login if on protected page
            const protectedPages = ['dashboard.html', 'deposit.html'];
            const currentPage = window.location.pathname.split('/').pop();
            if (protectedPages.includes(currentPage)) {
                window.location.href = 'login.html';
            }
        }
    });

    // Handle logout buttons
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            auth.signOut().then(() => {
                window.location.href = 'index.html';
            });
        });
    }
});

// ===== Auth functions (login.html) =====
if (document.getElementById('loginBtn')) {
    document.getElementById('loginBtn').addEventListener('click', () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        auth.signInWithEmailAndPassword(email, password)
            .then(() => {
                window.location.href = 'dashboard.html';
            })
            .catch(error => {
                document.getElementById('authMessage').textContent = error.message;
            });
    });

    document.getElementById('signupBtn').addEventListener('click', async () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        try {
            const cred = await auth.createUserWithEmailAndPassword(email, password);
            // Generate unique user ID (BX + incremental)
            const userId = await generateUserId();
            // Save user in Firestore
            await db.collection('users').doc(cred.user.uid).set({
                email: email,
                balance: 0,
                userid: userId,
                created: firebase.firestore.FieldValue.serverTimestamp()
            });
            window.location.href = 'dashboard.html';
        } catch (error) {
            document.getElementById('authMessage').textContent = error.message;
        }
    });
}

// ===== Generate User ID =====
async function generateUserId() {
    const counterRef = db.collection('counters').doc('userCounter');
    return db.runTransaction(async (transaction) => {
        const doc = await transaction.get(counterRef);
        if (!doc.exists) {
            transaction.set(counterRef, { lastId: 1000 });
            return 'BX1001';
        } else {
            const newId = doc.data().lastId + 1;
            transaction.update(counterRef, { lastId: newId });
            return `BX${newId}`;
        }
    });
}

// ===== Dashboard functions =====
async function loadDashboardData() {
    if (!currentUser) return;
    const userDoc = await db.collection('users').doc(currentUser.uid).get();
    if (!userDoc.exists) return;
    const userData = userDoc.data();
    document.getElementById('userEmail').textContent = userData.email;
    document.getElementById('userId').textContent = userData.userid;
    document.getElementById('userBalance').textContent = userData.balance;

    // Load services
    const servicesSnapshot = await db.collection('services').get();
    const serviceSelect = document.getElementById('serviceSelect');
    servicesSnapshot.forEach(doc => {
        const service = doc.data();
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = `${service.name} - ₹${service.price}/unit`;
        option.dataset.price = service.price;
        serviceSelect.appendChild(option);
    });

    // Price calculation
    document.getElementById('quantity').addEventListener('input', calculatePrice);
    document.getElementById('serviceSelect').addEventListener('change', calculatePrice);

    // Load order history
    loadOrderHistory();

    // Load notifications
    loadNotifications();
}

function calculatePrice() {
    const serviceSelect = document.getElementById('serviceSelect');
    const selected = serviceSelect.options[serviceSelect.selectedIndex];
    const pricePerUnit = selected.dataset.price ? parseFloat(selected.dataset.price) : 0;
    const quantity = parseInt(document.getElementById('quantity').value) || 0;
    const total = pricePerUnit * quantity;
    document.getElementById('totalPrice').textContent = total.toFixed(2);
}

// ===== Place order =====
if (document.getElementById('orderForm')) {
    document.getElementById('orderForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) return;

        const serviceId = document.getElementById('serviceSelect').value;
        const link = document.getElementById('link').value;
        const quantity = parseInt(document.getElementById('quantity').value);
        const totalPrice = parseFloat(document.getElementById('totalPrice').textContent);

        // Get user balance
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        const balance = userDoc.data().balance;

        if (balance < totalPrice) {
            window.location.href = 'deposit.html';
            return;
        }

        // Deduct balance and create order
        const orderData = {
            userId: currentUser.uid,
            service: serviceId,
            link,
            quantity,
            price: totalPrice,
            status: 'pending',
            date: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.runTransaction(async (transaction) => {
            transaction.update(db.collection('users').doc(currentUser.uid), {
                balance: balance - totalPrice
            });
            transaction.set(db.collection('orders').doc(), orderData);
        });

        alert('Order placed successfully!');
        loadDashboardData(); // refresh
    });
}

async function loadOrderHistory() {
    const ordersSnapshot = await db.collection('orders')
        .where('userId', '==', currentUser.uid)
        .orderBy('date', 'desc')
        .get();

    const tbody = document.querySelector('#orderTable tbody');
    tbody.innerHTML = '';
    ordersSnapshot.forEach(doc => {
        const order = doc.data();
        const row = tbody.insertRow();
        row.insertCell().textContent = order.service; // Ideally get service name
        row.insertCell().textContent = order.link.substring(0, 20) + '...';
        row.insertCell().textContent = order.quantity;
        row.insertCell().textContent = `₹${order.price}`;
        row.insertCell().textContent = order.status;
        row.insertCell().textContent = order.date ? new Date(order.date.toDate()).toLocaleString() : '';
    });
}

async function loadNotifications() {
    const notifSnapshot = await db.collection('notifications')
        .where('userId', '==', currentUser.uid)
        .where('status', '==', 'unread')
        .orderBy('date', 'desc')
        .get();

    const notifDiv = document.getElementById('notificationList');
    notifDiv.innerHTML = '';
    notifSnapshot.forEach(doc => {
        const notif = doc.data();
        const item = document.createElement('div');
        item.className = 'notification-item';
        item.textContent = notif.message;
        notifDiv.appendChild(item);
        // Mark as read (optional)
        doc.ref.update({ status: 'read' });
    });
}

// ===== Deposit page =====
if (document.getElementById('payNowBtn')) {
    const amountInput = document.getElementById('depositAmount');
    const payNowBtn = document.getElementById('payNowBtn');
    const generateQrBtn = document.getElementById('generateQrBtn');
    const qrContainer = document.getElementById('qrContainer');
    const iHavePaidBtn = document.getElementById('iHavePaidBtn');

    payNowBtn.addEventListener('click', () => {
        const amount = amountInput.value;
        if (!amount || amount <= 0) return alert('Enter valid amount');
        const upiLink = `upi://pay?pa=9019123302@fam&pn=Imran&am=${amount}&cu=INR`;
        window.location.href = upiLink;
    });

    generateQrBtn.addEventListener('click', () => {
        const amount = amountInput.value;
        if (!amount || amount <= 0) return alert('Enter valid amount');
        const upiLink = `upi://pay?pa=9019123302@fam&pn=Imran&am=${amount}&cu=INR`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiLink)}`;
        qrContainer.innerHTML = `<img src="${qrUrl}" alt="QR Code">`;
        iHavePaidBtn.style.display = 'inline-block';
    });

    iHavePaidBtn.addEventListener('click', async () => {
        const amount = parseFloat(amountInput.value);
        if (!amount || amount <= 0) return alert('Enter valid amount');
        await db.collection('deposits').add({
            userId: currentUser.uid,
            amount: amount,
            status: 'pending',
            date: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('Deposit request submitted. Admin will approve shortly.');
        amountInput.value = '';
        qrContainer.innerHTML = '';
        iHavePaidBtn.style.display = 'none';
    });
}

// ===== Contact page =====
if (document.getElementById('contactForm')) {
    document.getElementById('contactForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const message = document.getElementById('contactMessage').value;
        const whatsappUrl = `https://wa.me/+6282298431688?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
    });
}

// ===== Admin page =====
if (window.location.pathname.includes('admin.html')) {
    // Admin login logic
    const adminLoginSection = document.getElementById('adminLoginSection');
    const adminPanel = document.getElementById('adminPanel');
    const adminLoginForm = document.getElementById('adminLoginForm');
    const adminLogout = document.getElementById('adminLogout');

    // Check session
    if (sessionStorage.getItem('adminLoggedIn') === 'true') {
        adminLoginSection.style.display = 'none';
        adminPanel.style.display = 'block';
        loadAdminData();
    }

    adminLoginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = document.getElementById('adminUser').value;
        const pass = document.getElementById('adminPass').value;
        if (user === 'md admin' && pass === '1316781hfw1') {
            sessionStorage.setItem('adminLoggedIn', 'true');
            adminLoginSection.style.display = 'none';
            adminPanel.style.display = 'block';
            loadAdminData();
        } else {
            document.getElementById('adminLoginMessage').textContent = 'Invalid credentials';
        }
    });

    adminLogout.addEventListener('click', (e) => {
        e.preventDefault();
        sessionStorage.removeItem('adminLoggedIn');
        location.reload();
    });

    async function loadAdminData() {
        loadPendingOrders();
        loadDepositRequests();
        loadServicesForEdit();
    }

    // Pending orders
    async function loadPendingOrders() {
        const ordersSnapshot = await db.collection('orders').where('status', '==', 'pending').get();
        const div = document.getElementById('pendingOrders');
        div.innerHTML = '';
        ordersSnapshot.forEach(doc => {
            const order = doc.data();
            const orderDiv = document.createElement('div');
            orderDiv.innerHTML = `
                <p>Order ${doc.id}: ${order.quantity} x ${order.service} - ${order.link}</p>
                <button class="neon-btn mark-complete" data-id="${doc.id}">Mark Complete</button>
            `;
            div.appendChild(orderDiv);
        });

        document.querySelectorAll('.mark-complete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const orderId = e.target.dataset.id;
                await db.collection('orders').doc(orderId).update({ status: 'completed' });
                // Create notification
                const order = await (await db.collection('orders').doc(orderId).get()).data();
                await db.collection('notifications').add({
                    userId: order.userId,
                    message: 'Congratulations! Your order is complete',
                    status: 'unread',
                    date: firebase.firestore.FieldValue.serverTimestamp()
                });
                loadPendingOrders();
            });
        });
    }

    // Deposit requests
    async function loadDepositRequests() {
        const depositsSnapshot = await db.collection('deposits').where('status', '==', 'pending').get();
        const div = document.getElementById('depositRequests');
        div.innerHTML = '';
        depositsSnapshot.forEach(doc => {
            const dep = doc.data();
            const depDiv = document.createElement('div');
            depDiv.innerHTML = `
                <p>User ${dep.userId} - ₹${dep.amount}</p>
                <button class="neon-btn approve-deposit" data-id="${doc.id}" data-user="${dep.userId}" data-amount="${dep.amount}">Approve</button>
            `;
            div.appendChild(depDiv);
        });

        document.querySelectorAll('.approve-deposit').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const depositId = e.target.dataset.id;
                const userId = e.target.dataset.user;
                const amount = parseFloat(e.target.dataset.amount);
                await db.runTransaction(async (transaction) => {
                    const userRef = db.collection('users').doc(userId);
                    const userDoc = await transaction.get(userRef);
                    const newBalance = (userDoc.data().balance || 0) + amount;
                    transaction.update(userRef, { balance: newBalance });
                    transaction.update(db.collection('deposits').doc(depositId), { status: 'approved' });
                });
                loadDepositRequests();
            });
        });
    }

    // Add service
    document.getElementById('addServiceForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('serviceName').value;
        const price = parseFloat(document.getElementById('servicePrice').value);
        await db.collection('services').add({ name, price });
        alert('Service added');
        loadServicesForEdit();
    });

    // Edit services
    async function loadServicesForEdit() {
        const servicesSnapshot = await db.collection('services').get();
        const div = document.getElementById('servicesList');
        div.innerHTML = '';
        servicesSnapshot.forEach(doc => {
            const s = doc.data();
            const serviceDiv = document.createElement('div');
            serviceDiv.innerHTML = `
                <p>${s.name} - ₹${s.price}
                    <button class="neon-btn delete-service" data-id="${doc.id}">Delete</button>
                    <button class="neon-btn edit-service" data-id="${doc.id}">Edit</button>
                </p>
            `;
            div.appendChild(serviceDiv);
        });

        // Delete
        document.querySelectorAll('.delete-service').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (confirm('Delete this service?')) {
                    await db.collection('services').doc(e.target.dataset.id).delete();
                    loadServicesForEdit();
                }
            });
        });

        // Edit (simple prompt for demo)
        document.querySelectorAll('.edit-service').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                const newName = prompt('New name:');
                const newPrice = prompt('New price:');
                if (newName && newPrice) {
                    await db.collection('services').doc(id).update({ name: newName, price: parseFloat(newPrice) });
                    loadServicesForEdit();
                }
            });
        });
    }

    // Refresh buttons
    document.getElementById('refreshOrders')?.addEventListener('click', loadPendingOrders);
    document.getElementById('refreshDeposits')?.addEventListener('click', loadDepositRequests);
  }
