(function () {
  'use strict';

  /* ===== KONFIGURASI SUPABASE =====
     Isi dari Supabase > Project Settings > API.
     Pakai anon/public key. JANGAN PERNAH memakai service_role key di file ini.
     Keamanan data dijaga oleh RLS di database (lihat file SQL), bukan oleh kerahasiaan anon key. */
  var SUPABASE_URL = 'https://jgdwocchidcvyxwunrdt.supabase.co';      // contoh: https://abcdefgh.supabase.co
  var SUPABASE_ANON_KEY = 'sb_publishable_TeYqzrowYSq3uYCwI89LVg__jY9l3fX';
  var TABLE = 'produk', BUCKET = 'produk-images';

  var WA_NUMBER = '6285718955570';
  // LocalStorage HANYA untuk keranjang (dan preferensi urutan). Daftar produk ada di Supabase.
  var KEY_C = 'bs_cart_v3', KEY_S = 'bs_sort_v2';
  var SORTS = ['default', 'murah', 'mahal', 'az', 'stok'];
  var CATS = ['Sembako', 'Snack', 'Minuman', 'Kebutuhan Rumah'];
  var KG3 = ['1 kg', '1/2 kg', '1/4 kg'];
  var FOTO_MIN = 500 * 1024, FOTO_MAX = 2 * 1024 * 1024;
  var MAX_PRICE = 10000000, MAX_QTY = 99, MAX_CSV_ROWS = 500;
  var FOTO_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

  var BASE = String(SUPABASE_URL).replace(/\/+$/, '');
  var configured = /^https:\/\/\S+$/.test(BASE) && BASE.indexOf('ISI_') === -1 &&
    SUPABASE_ANON_KEY.indexOf('ISI_') === -1 && SUPABASE_ANON_KEY.length > 20;
  var PUBLIC_PREFIX = BASE + '/storage/v1/object/public/' + BUCKET + '/';
  var PATH_RE = /^[A-Za-z0-9_\-\/.]{1,200}$/;

  // Bersihkan sisa data produk lama dari versi LocalStorage.
  try { localStorage.removeItem('bs_products_v2'); localStorage.removeItem('bs_cart_v2'); } catch (e) { /* abaikan */ }

  function createSb(persist) {
    if (!configured || !window.supabase || !window.supabase.createClient) return null;
    try {
      return window.supabase.createClient(BASE, SUPABASE_ANON_KEY,
        persist ? {} : { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    } catch (e) { return null; }
  }

  function formatRupiah(angka) { return 'Rp ' + Number(angka).toLocaleString('id-ID'); }
  function load(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }
  function clean(s, max) {
    return String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  }
  function pathFromUrl(url) {
    if (typeof url !== 'string' || url.indexOf(PUBLIC_PREFIX) !== 0) return '';
    var p = url.slice(PUBLIC_PREFIX.length);
    return PATH_RE.test(p) && p.indexOf('..') === -1 ? p : '';
  }
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  var toastTimer;
  // tipe: 'sukses' | 'error' | 'info'. Hilang otomatis (default 2 detik).
  function tampilkanToast(pesan, tipe, ms) {
    var t = $('toast'); if (!t) return;
    t.textContent = pesan;
    t.className = 'toast show ' + (tipe === 'sukses' || tipe === 'error' ? tipe : 'info');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2000);
  }
  function errMsg(e) { return (e && e.message) ? e.message : 'Terjadi kesalahan. Coba lagi.'; }

  /* ---------- Data produk (Supabase) ---------- */
  function fromRow(r) { // baris database -> objek aplikasi
    return { id: r.id, nama: r.nama, harga: r.harga, kategori: r.kategori, stok: r.stok, satuan: r.satuan,
      hargaPerSatuan: r.harga_per_satuan, gambar: r.gambar_url || '', gambarPath: r.gambar_path || '' };
  }
  function cleanProducts(arr) {
    var seen = {}, out = [];
    if (!Array.isArray(arr)) return out;
    arr.forEach(function (p) {
      if (!p || typeof p !== 'object') return;
      var id = parseInt(p.id, 10), harga = parseInt(p.harga, 10), nama = clean(p.nama, 60);
      if (!(id > 0) || seen[id] || !nama || !(harga > 0 && harga <= MAX_PRICE) || CATS.indexOf(p.kategori) === -1) return;
      var satuan = 'pcs';
      if (Array.isArray(p.satuan)) {
        var s = p.satuan.map(function (u) { return clean(u, 12); }).filter(function (u) { return u && u.indexOf('|') === -1; }).slice(0, 6);
        if (s.length) satuan = s;
      }
      var gambar = pathFromUrl(p.gambar) ? p.gambar : '';
      var gp = typeof p.gambarPath === 'string' && PATH_RE.test(p.gambarPath) && p.gambarPath.indexOf('..') === -1 ? p.gambarPath : pathFromUrl(gambar);
      var o = { id: id, nama: nama, harga: harga, kategori: p.kategori, satuan: satuan, gambar: gambar, gambarPath: gp,
        stok: Math.min(Math.max(parseInt(p.stok, 10) || 0, 0), 9999) };
      if (Array.isArray(satuan) && p.hargaPerSatuan && typeof p.hargaPerSatuan === 'object') {
        var h = Object.create(null), any = false;
        satuan.forEach(function (u) {
          var v = Object.prototype.hasOwnProperty.call(p.hargaPerSatuan, u) ? parseInt(p.hargaPerSatuan[u], 10) : 0;
          if (v > 0 && v <= MAX_PRICE) { h[u] = v; any = true; }
        });
        if (any) o.hargaPerSatuan = h;
      }
      seen[id] = 1; out.push(o);
    });
    return out;
  }
  async function fetchProducts(client) {
    var r = await client.from(TABLE).select('*').order('id', { ascending: true });
    if (r.error) throw r.error;
    return cleanProducts((r.data || []).map(fromRow));
  }
  var products = [];

  /* Satuan & harga: harga di data = harga satuan pertama. Satuan lain proporsional,
     kecuali produk punya hargaPerSatuan (misal telur). */
  function unitsOf(p) { return Array.isArray(p.satuan) ? p.satuan : ['pcs']; }
  function fraction(u) {
    var m = /^(\d+)(?:\/(\d+))?/.exec(u);
    return m ? Number(m[1]) / (m[2] ? Number(m[2]) : 1) : 1;
  }
  function priceFor(p, u) {
    if (p.hargaPerSatuan && p.hargaPerSatuan[u] > 0) return p.hargaPerSatuan[u];
    return Math.round(p.harga * fraction(u) / fraction(unitsOf(p)[0]));
  }
  function labelOf(nama, u) { return u === 'pcs' ? nama : nama + ' ' + u; }
  function findP(id) { return products.filter(function (p) { return p.id === Number(id); })[0]; }

  function thumbEl(p, cls) { // gambar kalau ada, kalau tidak kotak abu-abu berinisial
    var box = el('div', cls);
    if (p.gambar) {
      var img = el('img', 'p-img'); img.src = p.gambar; img.alt = p.nama; img.loading = 'lazy';
      box.appendChild(img);
    } else box.appendChild(el('div', 'p-ph', p.nama.charAt(0).toUpperCase()));
    return box;
  }
  function openWA(text) {
    var url = 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(text);
    var w = window.open(url, '_blank');
    if (w) { w.opener = null; } else { location.href = url; }
  }

  /* ---------- Keranjang (LocalStorage): { "id|satuan": {id, unit, nama, harga, qty} } ---------- */
  function cleanCart(obj) {
    var out = {};
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
    Object.keys(obj).forEach(function (k) {
      var e = obj[k];
      if (!/^\d+\|[^|]{1,12}$/.test(k) || !e || typeof e !== 'object') return;
      var parts = k.split('|'), id = parseInt(parts[0], 10), qty = parseInt(e.qty, 10),
        harga = parseInt(e.harga, 10), nama = clean(e.nama, 60);
      if (!(id > 0) || !(qty > 0) || !(harga > 0 && harga <= MAX_PRICE) || !nama || e.unit !== parts[1]) return;
      out[k] = { id: id, unit: parts[1], nama: nama, harga: harga, qty: Math.min(qty, MAX_QTY) };
    });
    return out;
  }
  var cart = cleanCart(load(KEY_C, {}));

  /* ---------- Halaman toko ---------- */
  function initShop() {
    var grid = $('productGrid'); if (!grid) return;
    var sb = createSb(false);
    var activeCat = 'Semua', query = '', queryRaw = '';
    var sortBy = load(KEY_S, 'default'); if (SORTS.indexOf(sortBy) === -1) sortBy = 'default';

    function renderChips() {
      var box = $('chips'); box.textContent = '';
      ['Semua'].concat(CATS).forEach(function (c) {
        var b = el('button', 'chip' + (c === activeCat ? ' on' : ''), c);
        b.type = 'button';
        b.addEventListener('click', function () { activeCat = c; renderChips(); renderGrid(); });
        box.appendChild(b);
      });
    }
    function emptyState(icon, msg, btnText, fn) {
      var d = el('div', 'empty-state');
      d.appendChild(el('div', 'es-icon', icon)); d.appendChild(el('p', null, msg));
      if (btnText) { var b = el('button', 'btn-ghost es-btn', btnText); b.type = 'button'; b.addEventListener('click', fn); d.appendChild(b); }
      grid.appendChild(d);
    }
    function price0(p) { return priceFor(p, unitsOf(p)[0]); }
    function visible() { // filter & urutkan di sisi client
      var l = products.filter(function (p) {
        return (activeCat === 'Semua' || p.kategori === activeCat) && p.nama.toLowerCase().indexOf(query) !== -1;
      });
      if (sortBy === 'murah') l.sort(function (a, b) { return price0(a) - price0(b); });
      else if (sortBy === 'mahal') l.sort(function (a, b) { return price0(b) - price0(a); });
      else if (sortBy === 'az') l.sort(function (a, b) { return a.nama.localeCompare(b.nama, 'id'); });
      else if (sortBy === 'stok') l.sort(function (a, b) { return b.stok - a.stok; });
      return l;
    }
    function pop(btn) {
      btn.classList.add('pressed'); setTimeout(function () { btn.classList.remove('pressed'); }, 140);
      var b = $('cartCount'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
    }
    function renderGrid() {
      grid.textContent = '';
      var inCat = products.filter(function (p) { return activeCat === 'Semua' || p.kategori === activeCat; });
      if (!inCat.length) {
        emptyState('🧺', activeCat === 'Semua' ? 'Belum ada produk di toko ini' : 'Belum ada produk di kategori ini',
          activeCat === 'Semua' ? '' : 'Lihat Semua Produk', function () { activeCat = 'Semua'; renderChips(); renderGrid(); });
        return;
      }
      var list = visible();
      if (!list.length) {
        emptyState('🔎', 'Produk "' + queryRaw + '" tidak ditemukan. Coba kata lain?', 'Reset Pencarian',
          function () { $('search').value = ''; query = ''; queryRaw = ''; renderGrid(); });
        return;
      }
      list.forEach(function (p) {
        var units = unitsOf(p), multi = Array.isArray(p.satuan);
        var card = el('article', 'card-p');
        var th = thumbEl(p, 'thumb');
        // Badge stok hanya tampilan. Stok TIDAK berkurang otomatis saat pesanan dibuat;
        // Bu Suwati mengubah stok manual lewat halaman admin.
        if (p.stok === 0) th.appendChild(el('span', 'stok-badge stok-habis', 'Habis'));
        else if (p.stok <= 5) th.appendChild(el('span', 'stok-badge stok-sisa', 'Stok terbatas'));
        card.appendChild(th);
        var body = el('div', 'p-body');
        body.appendChild(el('span', 'p-cat', p.kategori));
        body.appendChild(el('h3', 'p-name', p.nama));
        var price = el('p', 'p-price', formatRupiah(priceFor(p, units[0])));
        body.appendChild(price);
        if (p.stok > 0) body.appendChild(el('p', 'p-stok' + (p.stok <= 5 ? ' low' : ''), 'Sisa ' + p.stok));
        var sel = null;
        if (multi) {
          sel = el('select', 'unit-sel'); sel.setAttribute('aria-label', 'Satuan ' + p.nama);
          units.forEach(function (u) { var o = el('option', null, u); o.value = u; sel.appendChild(o); });
          sel.addEventListener('change', function () { price.textContent = formatRupiah(priceFor(p, sel.value)); });
          body.appendChild(sel);
        }
        function cur() { return sel ? sel.value : units[0]; }
        var act = el('div', 'p-actions');
        var add = el('button', 'add', 'Tambah ke Keranjang'); add.type = 'button';
        if (p.stok === 0) { add.disabled = true; add.textContent = 'Habis'; }
        add.addEventListener('click', function () { addToCart(p, cur()); pop(add); tampilkanToast('Ditambahkan!', 'sukses', 1500); });
        var ask = el('button', 'ask', 'Tanya via WA'); ask.type = 'button';
        ask.addEventListener('click', function () {
          openWA('Halo Bu Suwati, saya mau tanya produk *' + p.nama + '* dengan harga ' +
            formatRupiah(priceFor(p, cur())) + (multi ? ' per ' + cur() : '') + '. Apakah stoknya tersedia?');
        });
        act.appendChild(add); act.appendChild(ask); body.appendChild(act);
        card.appendChild(body); grid.appendChild(card);
      });
    }

    async function loadCatalog() {
      grid.textContent = '';
      if (!sb) { emptyState('⚙️', 'Koneksi database belum diatur. Isi SUPABASE_URL dan SUPABASE_ANON_KEY di script.js.', ''); return; }
      emptyState('⏳', 'Sedang memuat produk...', '');
      try {
        products = await fetchProducts(sb);
      } catch (e) {
        grid.textContent = '';
        emptyState('📡', 'Produk gagal dimuat. Periksa koneksi internet, lalu coba lagi.', 'Coba Lagi', loadCatalog);
        return;
      }
      reconcileCart(); renderGrid(); renderCart();
    }
    // Samakan nama/harga di keranjang dengan data terbaru; buang barang yang sudah dihapus admin.
    function reconcileCart() {
      var changed = false;
      Object.keys(cart).forEach(function (k) {
        var e = cart[k], p = findP(e.id);
        if (!p || unitsOf(p).indexOf(e.unit) === -1) { delete cart[k]; changed = true; return; }
        var pr = priceFor(p, e.unit);
        if (e.nama !== p.nama || e.harga !== pr) { e.nama = p.nama; e.harga = pr; changed = true; }
      });
      if (changed) { save(KEY_C, cart); tampilkanToast('Keranjang disesuaikan dengan data produk terbaru', 'info', 3000); }
    }

    function persist() { save(KEY_C, cart); renderCart(); }
    function addToCart(p, u) {
      var k = p.id + '|' + u, e = cart[k];
      if (e) e.qty = Math.min(e.qty + 1, MAX_QTY);
      else cart[k] = { id: p.id, unit: u, nama: p.nama, harga: priceFor(p, u), qty: 1 };
      persist();
    }
    function setQty(k, q) { if (q <= 0) delete cart[k]; else cart[k].qty = Math.min(q, MAX_QTY); persist(); }
    function items() {
      return Object.keys(cart).map(function (k) {
        var e = cart[k]; return { key: k, nama: e.nama, u: e.unit, q: e.qty, price: e.harga };
      });
    }
    function lineOf(i) { return labelOf(i.nama, i.u) + ' × ' + i.q; }
    function total() { return items().reduce(function (s, i) { return s + i.price * i.q; }, 0); }
    function listText(its) {
      return its.map(function (i, n) { return (n + 1) + '. ' + lineOf(i) + ' = ' + formatRupiah(i.price * i.q); }).join('\n');
    }

    function renderCart() {
      var list = $('cartList'); list.textContent = '';
      var its = items(), count = 0;
      its.forEach(function (i) {
        count += i.q;
        var li = el('li', 'cart-item');
        var left = el('div'); left.appendChild(el('div', 'ci-name', lineOf(i)));
        var q = el('div', 'qty');
        var m = el('button', null, '−'); m.type = 'button'; m.setAttribute('aria-label', 'Kurangi ' + labelOf(i.nama, i.u));
        var pl = el('button', null, '+'); pl.type = 'button'; pl.setAttribute('aria-label', 'Tambah ' + labelOf(i.nama, i.u));
        m.addEventListener('click', function () { setQty(i.key, i.q - 1); });
        pl.addEventListener('click', function () { setQty(i.key, i.q + 1); });
        q.appendChild(m); q.appendChild(el('span', null, String(i.q))); q.appendChild(pl);
        left.appendChild(q);
        li.appendChild(left); li.appendChild(el('div', 'ci-sub', formatRupiah(i.price * i.q)));
        list.appendChild(li);
      });
      $('cartCount').textContent = count;
      $('cartTotal').textContent = formatRupiah(total());
      $('cartEmpty').hidden = its.length > 0;
      $('orderForm').hidden = its.length === 0;
    }

    function fallbackCopy(t) {
      var ta = document.createElement('textarea'), ok = false;
      ta.value = t; ta.setAttribute('readonly', ''); ta.className = 'sr';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta); return ok;
    }
    function copyText(t) {
      function res(ok) { tampilkanToast(ok ? 'Tersalin!' : 'Gagal menyalin, salin manual ya', ok ? 'sukses' : 'error'); }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(t).then(function () { res(true); }, function () { res(fallbackCopy(t)); });
      } else res(fallbackCopy(t));
    }
    $('copyList').addEventListener('click', function () {
      var its = items(); if (!its.length) return;
      copyText('Daftar belanja:\n' + listText(its) + '\n\nTotal: ' + formatRupiah(total()));
    });
    $('copyTotal').addEventListener('click', function () { copyText(formatRupiah(total())); });

    var lastFocus;
    function openCart() {
      lastFocus = document.activeElement;
      $('drawer').classList.add('open'); $('drawer').setAttribute('aria-hidden', 'false'); $('overlay').hidden = false;
      document.body.classList.add('lock'); $('closeCart').focus();
    }
    function closeCart() {
      if (!$('drawer').classList.contains('open')) return;
      $('drawer').classList.remove('open'); $('drawer').setAttribute('aria-hidden', 'true'); $('overlay').hidden = true;
      document.body.classList.remove('lock');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    $('openCart').addEventListener('click', openCart);
    $('closeCart').addEventListener('click', closeCart);
    $('overlay').addEventListener('click', closeCart);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCart(); });
    $('clearCart').addEventListener('click', function () { cart = {}; persist(); });
    $('search').addEventListener('input', function (e) { queryRaw = e.target.value.trim(); query = queryRaw.toLowerCase(); renderGrid(); });
    $('sort').value = sortBy;
    $('sort').addEventListener('change', function (e) {
      sortBy = SORTS.indexOf(e.target.value) === -1 ? 'default' : e.target.value; save(KEY_S, sortBy); renderGrid();
    });
    $('emptyBrowse').addEventListener('click', function () { closeCart(); $('katalog').scrollIntoView(); });

    var form = $('orderForm');
    function syncMode() {
      var diantar = form.mode.value === 'Diantar';
      $('alamatWrap').hidden = !diantar;
      $('alamat').required = diantar;
    }
    Array.prototype.forEach.call(form.mode, function (r) { r.addEventListener('change', syncMode); });
    syncMode();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var its = items();
      if (!its.length) { tampilkanToast('Keranjang masih kosong', 'error'); return; }
      var mode = form.mode.value === 'Ambil Sendiri' ? 'Ambil Sendiri' : 'Diantar';
      var nama = clean(form.nama.value, 60), alamat = clean(form.alamat.value, 200), note = clean(form.catatan.value, 200);
      if (!nama) { tampilkanToast('Isi nama dulu ya', 'error'); form.nama.focus(); return; }
      if (mode === 'Diantar' && !alamat) { tampilkanToast('Isi alamat pengantaran', 'error'); form.alamat.focus(); return; }
      var lines = ['Halo Bu Suwati, saya mau pesan:', '', 'Nama: ' + nama, 'Penerimaan: ' + mode];
      if (mode === 'Diantar') lines.push('Alamat: ' + alamat);
      lines.push('', 'Daftar belanja:', listText(its), '', 'Total: ' + formatRupiah(total()));
      if (note) lines.push('Catatan: ' + note);
      lines.push('', 'Terima kasih!');
      var btn = form.querySelector('button[type=submit]'), label = btn.textContent;
      btn.disabled = true; btn.classList.add('loading'); btn.textContent = 'Menyiapkan...';
      setTimeout(function () {
        btn.disabled = false; btn.classList.remove('loading'); btn.textContent = label;
        openWA(lines.join('\n'));
      }, 600);
    });

    renderChips(); renderCart(); loadCatalog();
  }

  /* ---------- Halaman admin ---------- */
  function initAdmin() {
    var panel = $('adminPanel'); if (!panel) return;
    var sb = createSb(true);
    var loginCard = $('loginCard'), loginForm = $('loginForm'), loginErr = $('loginErr'), logoutBtn = $('logoutBtn');
    var list = $('adminList'), form = $('addForm'), sel = $('pKategori'), satSel = $('pSatuan'), fileIn = $('produk-gambar');
    var prev = $('preview-gambar'), err = $('gambar-error'), curCap = $('gambarSaatIni');
    var title = $('formTitle'), submitBtn = $('submitBtn'), cancelBtn = $('cancelEdit');
    var pending = null;  // { file, dataUrl } foto baru yang dipilih (belum diunggah)
    var editId = null, oldImg = '', busy = false, started = false;
    CATS.forEach(function (c) { var o = el('option', null, c); o.value = c; sel.appendChild(o); });

    function setBusy(b) {
      busy = b; submitBtn.disabled = b; submitBtn.classList.toggle('loading', b);
      if (b) submitBtn.dataset.label = submitBtn.textContent;
      submitBtn.textContent = b ? 'Menyimpan...' : (submitBtn.dataset.label || submitBtn.textContent);
    }

    /* --- Login (Supabase Auth). Menulis ke database hanya boleh untuk pengguna yang login. --- */
    function showFor(session) {
      var on = !!session;
      loginCard.hidden = on; panel.hidden = !on; logoutBtn.hidden = !on;
      if (on && !started) { started = true; setTimeout(refresh, 0); }
      if (!on) { started = false; products = []; }
    }
    if (!sb) {
      loginErr.textContent = configured ? 'Library Supabase gagal dimuat. Periksa koneksi internet.' :
        'Supabase belum dikonfigurasi. Isi SUPABASE_URL dan SUPABASE_ANON_KEY di script.js.';
      loginErr.hidden = false; loginForm.querySelector('button').disabled = true; return;
    }
    sb.auth.getSession().then(function (r) { showFor(r.data && r.data.session); });
    sb.auth.onAuthStateChange(function (ev, session) { showFor(session); });
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = loginForm.querySelector('button'); btn.disabled = true; loginErr.hidden = true;
      var r = await sb.auth.signInWithPassword({ email: $('lEmail').value.trim(), password: $('lPass').value });
      btn.disabled = false;
      if (r.error) { loginErr.textContent = 'Email atau kata sandi salah.'; loginErr.hidden = false; return; }
      $('lPass').value = '';
    });
    logoutBtn.addEventListener('click', function () { sb.auth.signOut(); });

    /* --- Foto: validasi di sini, unggah ke Supabase Storage saat produk disimpan --- */
    function showOld() {
      var on = !!(editId !== null && oldImg);
      prev.hidden = !on; curCap.hidden = !on; if (on) prev.src = oldImg;
    }
    function badFoto(msg) { fileIn.value = ''; pending = null; showOld(); err.textContent = msg; err.hidden = false; }
    function pilihGambar(file) {
      pending = null; err.hidden = true; showOld();
      if (!file) return;
      if (!FOTO_EXT[file.type]) return badFoto('Format foto harus JPG, PNG, atau WebP.');
      if (file.size < FOTO_MIN) return badFoto('Foto terlalu kecil. Ukuran minimal 500 KB.');
      if (file.size > FOTO_MAX) return badFoto('Foto terlalu besar. Ukuran maksimal 2 MB.');
      var r = new FileReader();
      r.onload = function () {
        var s = String(r.result);
        if (!/^data:image\/(jpeg|png|webp);base64,/.test(s)) return badFoto('Foto tidak bisa dibaca. Coba file lain.');
        pending = { file: file, dataUrl: s }; prev.src = s; prev.hidden = false; curCap.hidden = true;
      };
      r.onerror = function () { badFoto('Foto tidak bisa dibaca. Coba file lain.'); };
      r.readAsDataURL(file);
    }
    fileIn.addEventListener('change', function () { pilihGambar(fileIn.files[0]); });
    async function uploadFoto(file) { // -> { url, path }
      var id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2);
      var path = 'produk/' + id + '.' + FOTO_EXT[file.type]; // ekstensi dari tipe file, bukan dari nama file
      var r = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
      if (r.error) throw r.error;
      return { url: sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, path: path };
    }
    async function removeFoto(path) { // true kalau berhasil
      if (!path) return true;
      try { var r = await sb.storage.from(BUCKET).remove([path]); return !r.error; } catch (e) { return false; }
    }

    function kind(p) {
      if (p.hargaPerSatuan) return 'keep';
      if (p.satuan === 'pcs') return 'pcs';
      return p.satuan.join('|') === KG3.join('|') ? 'kg' : 'keep';
    }
    function setSatuan(p) {
      Array.prototype.slice.call(satSel.options).forEach(function (o) { if (o.value === 'keep') satSel.removeChild(o); });
      if (p && kind(p) === 'keep') { var o = el('option', null, 'Tetap: ' + p.satuan.join(', ')); o.value = 'keep'; satSel.appendChild(o); }
      satSel.value = p ? kind(p) : 'pcs';
    }
    function modeTambah() {
      editId = null; oldImg = ''; pending = null;
      form.reset(); setSatuan(null); fileIn.value = '';
      title.textContent = 'Tambah produk baru'; submitBtn.textContent = 'Simpan produk'; submitBtn.dataset.label = '';
      cancelBtn.hidden = true; err.hidden = true; showOld(); form.classList.remove('editing');
    }
    function modeEdit(p) {
      modeTambah();
      editId = p.id; oldImg = p.gambar;
      $('pNama').value = p.nama; $('pHarga').value = p.harga; sel.value = p.kategori; $('pStok').value = p.stok;
      setSatuan(p); showOld();
      title.textContent = 'Edit Produk'; submitBtn.textContent = 'Simpan Perubahan'; submitBtn.dataset.label = '';
      cancelBtn.hidden = false; form.classList.add('editing');
      form.scrollIntoView({ block: 'start' }); $('pNama').focus();
    }
    cancelBtn.addEventListener('click', modeTambah);

    async function refresh() {
      try { products = await fetchProducts(sb); render(); }
      catch (e) { tampilkanToast('Gagal memuat produk: ' + errMsg(e), 'error', 4000); }
    }
    function hpsWith(p, harga) { // salinan hargaPerSatuan dengan harga satuan pertama diperbarui
      if (!p.hargaPerSatuan) return null;
      var h = {}; Object.keys(p.hargaPerSatuan).forEach(function (k) { h[k] = p.hargaPerSatuan[k]; });
      h[unitsOf(p)[0]] = harga; return h;
    }
    async function patch(p, fields, pesan) {
      try {
        var r = await sb.from(TABLE).update(fields).eq('id', p.id).select('id');
        if (r.error) throw r.error;
        if (!r.data || !r.data.length) throw new Error('Perubahan tidak tersimpan. Pastikan Anda masih login.');
        await refresh(); tampilkanToast(pesan, 'sukses');
      } catch (e) { tampilkanToast(errMsg(e), 'error', 4000); render(); }
    }

    function render() {
      list.textContent = '';
      $('adminCount').textContent = products.length;
      if (!products.length) list.appendChild(el('li', 'empty', 'Belum ada produk. Tambahkan lewat formulir di atas.'));
      products.forEach(function (p) {
        var li = el('li');
        li.appendChild(thumbEl(p, 'a-thumb'));
        var info = el('div', 'info', p.nama);
        info.appendChild(el('small', null, p.kategori + ' · ' + formatRupiah(p.harga) + (Array.isArray(p.satuan) ? ' per ' + p.satuan[0] : '')));
        function num(cls, label, val, max, step, onOk) {
          var i = el('input', cls); i.type = 'number'; i.min = step === 100 ? '100' : '0'; i.step = String(step);
          i.max = String(max); i.value = val; i.setAttribute('aria-label', label + ' ' + p.nama);
          i.addEventListener('change', function () {
            var v = parseInt(i.value, 10);
            if (!(v >= Number(i.min) && v <= max)) { i.value = val; tampilkanToast(label + ' tidak valid', 'error'); return; }
            onOk(v);
          });
          return i;
        }
        var pr = num('price-in', 'Harga', p.harga, MAX_PRICE, 100, function (v) { patch(p, { harga: v, harga_per_satuan: hpsWith(p, v) }, 'Harga diperbarui'); });
        var st = num('stok-in', 'Stok', p.stok, 9999, 1, function (v) { patch(p, { stok: v }, 'Stok diperbarui'); });
        var ed = el('button', 'edit', 'Edit'); ed.type = 'button'; ed.setAttribute('aria-label', 'Edit ' + p.nama);
        ed.addEventListener('click', function () { modeEdit(p); });
        var del = el('button', 'del', 'Hapus'); del.type = 'button'; del.setAttribute('aria-label', 'Hapus ' + p.nama);
        del.addEventListener('click', async function () {
          if (!confirm('Hapus "' + p.nama + '" dari toko?')) return;
          del.disabled = true;
          try {
            var r = await sb.from(TABLE).delete().eq('id', p.id).select('id');
            if (r.error) throw r.error;
            if (!r.data || !r.data.length) throw new Error('Produk tidak terhapus. Pastikan Anda masih login.');
            if (editId === p.id) modeTambah();
            var fotoOk = await removeFoto(p.gambarPath); // hapus juga file gambarnya di Storage
            await refresh();
            tampilkanToast(fotoOk ? 'Produk dihapus' : 'Produk dihapus, tapi file gambarnya gagal dihapus', fotoOk ? 'sukses' : 'info', 3500);
          } catch (e) { del.disabled = false; tampilkanToast(errMsg(e), 'error', 4000); }
        });
        li.appendChild(info); li.appendChild(pr); li.appendChild(st); li.appendChild(ed); li.appendChild(del); list.appendChild(li);
      });
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault(); if (busy) return;
      var harga = parseInt($('pHarga').value, 10), stok = parseInt($('pStok').value, 10);
      var nama = clean($('pNama').value, 60), v = satSel.value;
      if (!nama || !(harga > 0 && harga <= MAX_PRICE) || !(stok >= 0 && stok <= 9999)) { tampilkanToast('Isi nama, harga, dan stok dengan benar', 'error'); return; }
      setBusy(true);
      var up = null, committed = false, editing = editId !== null;
      try {
        if (pending) up = await uploadFoto(pending.file);
        var fields = { nama: nama, harga: harga, kategori: sel.value, stok: stok, satuan: 'pcs', harga_per_satuan: null };
        if (up) { fields.gambar_url = up.url; fields.gambar_path = up.path; }
        else if (!editing) { fields.gambar_url = null; fields.gambar_path = null; }
        var old = null;
        if (editing) {
          old = products.filter(function (p) { return p.id === editId; })[0];
          if (!old) throw new Error('Produk tidak ditemukan. Muat ulang halaman.');
          if (v === 'keep' && Array.isArray(old.satuan)) { fields.satuan = old.satuan.slice(); fields.harga_per_satuan = hpsWith(old, harga); }
          else if (v === 'kg') fields.satuan = KG3.slice();
        } else if (v === 'kg') fields.satuan = KG3.slice();
        // id TIDAK diubah saat edit, supaya relasi ke keranjang tetap
        var r = editing ? await sb.from(TABLE).update(fields).eq('id', editId).select('id')
                        : await sb.from(TABLE).insert(fields).select('id');
        if (r.error) throw r.error;
        if (!r.data || !r.data.length) throw new Error('Data tidak tersimpan. Pastikan Anda masih login.');
        committed = true;
        if (editing && up && old.gambarPath) await removeFoto(old.gambarPath); // buang gambar lama yang diganti
        modeTambah(); await refresh();
        tampilkanToast(editing ? 'Produk berhasil diperbarui' : 'Produk disimpan', 'sukses');
      } catch (ex) {
        if (up && !committed) await removeFoto(up.path); // jangan tinggalkan file yatim di Storage
        tampilkanToast(errMsg(ex), 'error', 4500);
      } finally { setBusy(false); }
    });

    /* ---------- Import / Export CSV ---------- */
    var importInput = $('importCsv');
    function csvCell(value) {
      var s = String(value == null ? '' : value);
      if (/^[=+\-@]/.test(s)) s = "'" + s; // cegah formula CSV saat dibuka di spreadsheet
      return '"' + s.replace(/"/g, '""') + '"';
    }
    function csvText(v, max) { return clean(String(v == null ? '' : v).replace(/^'(?=[=+\-@])/, ''), max); }
    function downloadCsv(filename, rows) {
      var csv = '\uFEFF' + rows.map(function (row) { return row.map(csvCell).join(','); }).join('\r\n');
      var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      var a = document.createElement('a'); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
    function csvRows(text) {
      text = text.replace(/^\uFEFF/, '');
      var rows = [], row = [], cell = '', quoted = false;
      for (var i = 0; i < text.length; i++) {
        var ch = text[i], next = text[i + 1];
        if (quoted) {
          if (ch === '"' && next === '"') { cell += '"'; i++; }
          else if (ch === '"') quoted = false;
          else cell += ch;
        } else if (ch === '"' && cell === '') quoted = true;
        else if (ch === ',') { row.push(cell); cell = ''; }
        else if (ch === '\n' || ch === '\r') {
          if (ch === '\r' && next === '\n') i++;
          row.push(cell); cell = '';
          if (row.some(function (x) { return x.trim() !== ''; })) rows.push(row);
          row = [];
        } else cell += ch;
      }
      if (quoted) throw new Error('Tanda kutip CSV tidak berpasangan.');
      row.push(cell);
      if (row.some(function (x) { return x.trim() !== ''; })) rows.push(row);
      return rows;
    }
    function unitsKey(s) { return Array.isArray(s) ? s.join('|') : 'pcs'; }
    function exportCsv() {
      var rows = [['id', 'nama', 'harga', 'kategori', 'stok', 'satuan', 'gambar']];
      products.forEach(function (p) {
        rows.push([p.id, p.nama, p.harga, p.kategori, p.stok, Array.isArray(p.satuan) ? p.satuan.join('|') : p.satuan, p.gambar || '']);
      });
      downloadCsv('produk-warung-bu-suwati.csv', rows);
      tampilkanToast('File CSV berhasil diekspor', 'sukses');
    }
    function downloadTemplate() {
      downloadCsv('template-produk-warung.csv', [
        ['id', 'nama', 'harga', 'kategori', 'stok', 'satuan', 'gambar'],
        ['', 'Contoh Produk', '10000', 'Sembako', '10', 'pcs', '']
      ]);
    }
    // Baris tanpa id (atau id yang belum ada) -> .insert(). Baris dengan id yang sudah ada -> diperbarui (upsert).
    async function importCsvFile(file) {
      if (!file) return;
      if (busy) { tampilkanToast('Tunggu proses lain selesai dulu', 'info'); importInput.value = ''; return; }
      if (file.size > 5 * 1024 * 1024) { tampilkanToast('Ukuran CSV maksimal 5 MB', 'error'); importInput.value = ''; return; }
      busy = true;
      try {
        var rows = csvRows(await file.text());
        if (rows.length < 2) throw new Error('CSV tidak berisi data produk.');
        var headers = rows[0].map(function (h) { return h.trim().toLowerCase(); });
        var required = ['id', 'nama', 'harga', 'kategori', 'stok', 'satuan', 'gambar'];
        if (required.some(function (h) { return headers.indexOf(h) === -1; })) throw new Error('Header wajib: id,nama,harga,kategori,stok,satuan,gambar.');
        var col = {}; required.forEach(function (h) { col[h] = headers.indexOf(h); });
        var byId = {}; products.forEach(function (p) { byId[p.id] = p; });
        var inserts = [], updates = [], skipped = 0;
        rows.slice(1).forEach(function (r) {
          if (r.length < headers.length) { skipped++; return; }
          var nama = csvText(r[col.nama], 60), kategori = csvText(r[col.kategori], 40);
          var harga = Number(String(r[col.harga]).replace(/[.\s]/g, '').replace(',', '.'));
          var stok = Number(r[col.stok]), idRaw = String(r[col.id] || '').trim(), id = idRaw === '' ? 0 : Number(idRaw);
          var satuanRaw = csvText(r[col.satuan] || 'pcs', 100), gambar = String(r[col.gambar] || '').trim();
          if (!nama || !Number.isInteger(harga) || harga < 1 || harga > MAX_PRICE || CATS.indexOf(kategori) === -1 ||
              !Number.isInteger(stok) || stok < 0 || stok > 9999 || (idRaw !== '' && (!Number.isInteger(id) || id < 1)) ||
              (gambar && !pathFromUrl(gambar))) { skipped++; return; }
          var satuan = satuanRaw === 'pcs' ? 'pcs' : satuanRaw.split('|').map(function (s) { return clean(s, 12); }).filter(Boolean).slice(0, 6);
          if (Array.isArray(satuan) && !satuan.length) satuan = 'pcs';
          var old = id ? byId[id] : null;
          var row = { nama: nama, harga: harga, kategori: kategori, stok: stok, satuan: satuan,
            harga_per_satuan: null, gambar_url: gambar || null, gambar_path: gambar ? pathFromUrl(gambar) : null };
          if (old) {
            row.id = old.id;
            if (unitsKey(old.satuan) === unitsKey(satuan)) row.harga_per_satuan = hpsWith(old, harga);
            if (!gambar && old.gambar) { row.gambar_url = old.gambar; row.gambar_path = old.gambarPath || null; }
            updates.push(row);
          } else inserts.push(row);
        });
        if (!inserts.length && !updates.length) throw new Error('Tidak ada baris produk valid yang bisa diimpor.');
        if (inserts.length + updates.length > MAX_CSV_ROWS) throw new Error('Maksimal ' + MAX_CSV_ROWS + ' baris per impor.');
        if (inserts.length) { var a = await sb.from(TABLE).insert(inserts); if (a.error) throw a.error; }
        if (updates.length) {
          var b = await sb.from(TABLE).upsert(updates, { onConflict: 'id' });
          if (b.error) throw new Error((inserts.length ? 'Baris baru tersimpan, tapi pembaruan gagal: ' : '') + b.error.message);
        }
        await refresh();
        tampilkanToast('Import selesai: ' + inserts.length + ' ditambahkan, ' + updates.length + ' diperbarui, ' + skipped + ' dilewati.', skipped ? 'info' : 'sukses', 4500);
      } catch (e) { tampilkanToast(errMsg(e), 'error', 5000); }
      finally { busy = false; importInput.value = ''; }
    }
    $('exportCsv').addEventListener('click', exportCsv);
    $('downloadTemplate').addEventListener('click', downloadTemplate);
    importInput.addEventListener('change', function () { importCsvFile(importInput.files[0]); });
  }

  /* ---------- PWA: service worker, tombol install, status online/offline ---------- */
  function initPWA() {
    // Service worker hanya jalan lewat http/https (termasuk localhost), TIDAK di file://.
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && $('installBtn')) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./service-worker.js').catch(function () { /* abaikan */ });
      });
    }
    var inst = $('installBtn'), deferred = null;
    if (inst) {
      window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; inst.hidden = false; });
      inst.addEventListener('click', function () {
        if (!deferred) return;
        deferred.prompt();
        deferred.userChoice.then(function () { deferred = null; inst.hidden = true; });
      });
      window.addEventListener('appinstalled', function () { deferred = null; inst.hidden = true; });
    }
    var bar = $('offlineBar');
    function sync() { if (bar) bar.hidden = navigator.onLine; }
    window.addEventListener('online', sync); window.addEventListener('offline', sync); sync();
  }

  initShop();
  initAdmin();
  initPWA();
})();
