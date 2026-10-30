import { useEffect, useMemo, useState } from 'react'
import './App.css'

const products = [
  { id: 'everyday-case', name: 'Everyday Case', category: 'cases', price: 29, image: 'https://images.unsplash.com/photo-1601593346740-925612772716?auto=format&fit=crop&w=700&q=85', badge: 'BESTSELLER' },
  { id: 'cloud-buds', name: 'Cloud Buds', category: 'audio', price: 79, image: 'https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=700&q=85', badge: 'NEW' },
  { id: 'pocket-power', name: 'Pocket Power', category: 'power', price: 45, image: 'https://images.unsplash.com/photo-1625842268584-8f3296236761?auto=format&fit=crop&w=700&q=85' },
  { id: 'halo-shell', name: 'Halo Shell', category: 'cases', price: 39, image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=700&q=85', badge: 'NEW' },
  { id: 'ledger-sleeve', name: 'Ledger Sleeve', category: 'cases', price: 42, image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=700&q=85' },
  { id: 'orbit-speaker', name: 'Orbit Speaker', category: 'audio', price: 59, image: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=700&q=85' },
  { id: 'aural-mini', name: 'Aural Mini', category: 'audio', price: 69, image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=85', badge: 'BESTSELLER' },
  { id: 'grid-charger', name: 'Grid Charger', category: 'power', price: 64, image: 'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=700&q=85' },
  { id: 'travel-bank', name: 'Travel Bank', category: 'power', price: 89, image: 'https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?auto=format&fit=crop&w=700&q=85', badge: 'NEW' },
  { id: 'lumen-case', name: 'Lumen Case', category: 'cases', price: 32, image: 'https://images.unsplash.com/photo-1556656793-08538906a9f8?auto=format&fit=crop&w=700&q=85' },
  { id: 'terra-grip', name: 'Terra Grip', category: 'cases', price: 36, image: 'https://images.unsplash.com/photo-1541877944-ac82a091518a?auto=format&fit=crop&w=700&q=85', badge: 'NEW' },
  { id: 'studio-loop', name: 'Studio Loop', category: 'audio', price: 99, image: 'https://images.unsplash.com/photo-1484704849700-f032a568e944?auto=format&fit=crop&w=700&q=85' },
  { id: 'mini-mic', name: 'Mini Mic', category: 'audio', price: 74, image: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=700&q=85', badge: 'NEW' },
  { id: 'magnetic-pad', name: 'Magnetic Pad', category: 'power', price: 49, image: 'https://images.unsplash.com/photo-1618410320928-25228d811631?auto=format&fit=crop&w=700&q=85' },
  { id: 'desk-dock', name: 'Desk Dock', category: 'power', price: 72, image: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=700&q=85' },
  { id: 'pulse-smartwatch', name: 'Pulse Smartwatch', category: 'wearables', price: 129, image: 'https://images.unsplash.com/photo-1544117519-31a4b719223d?auto=format&fit=crop&w=700&q=85', badge: 'NEW' },
  { id: 'studio-keyboard', name: 'Studio Keyboard', category: 'workspace', price: 59, image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=700&q=85' }
]

const categories = [
  { id: 'cases', label: 'Phone cases', description: 'Protection, with personality', icon: '◒' },
  { id: 'audio', label: 'Audio', description: 'Sound that travels', icon: '◉' },
  { id: 'power', label: 'Power up', description: 'Never run on empty', icon: '◌' },
  { id: 'wearables', label: 'Wearables', description: 'Smart tech for life on the go', icon: '◷' },
  { id: 'workspace', label: 'Laptop & Desk', description: 'Everyday tools for your workspace', icon: '⌨' },
  { id: 'all', label: 'Desk & car', description: 'Stay in the flow', icon: '⌁' }
]

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
})

function readStorageValue(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function App() {
  const [activeFilter, setActiveFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [accountMode, setAccountMode] = useState('signin')
  const [accountMessage, setAccountMessage] = useState('')
  const [checkoutMessage, setCheckoutMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const [toastText, setToastText] = useState('Added to your bag')
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('mz-tech-hub-theme')
    return saved === 'light' ? 'light' : 'dark'
  })
  const [cart, setCart] = useState(() => readStorageValue('mz-tech-hub-cart', {}))
  const [storedAccount, setStoredAccount] = useState(null)
  const [accountForm, setAccountForm] = useState({ name: '', email: '', password: '' })

  useEffect(() => {
    document.body.dataset.theme = theme
    localStorage.setItem('mz-tech-hub-theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('mz-tech-hub-cart', JSON.stringify(cart))
  }, [cart])

  useEffect(() => {
    if (!toastVisible) return undefined
    const timer = window.setTimeout(() => setToastVisible(false), 1800)
    return () => window.clearTimeout(timer)
  }, [toastVisible])

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setCartOpen(false)
        setAccountOpen(false)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [])

  const visibleProducts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return products.filter((product) => {
      const matchesFilter = activeFilter === 'all' || product.category === activeFilter
      const matchesSearch = product.name.toLowerCase().includes(query)
      return matchesFilter && matchesSearch
    })
  }, [activeFilter, searchTerm])

  const cartEntries = Object.entries(cart)
  const totalItems = cartEntries.reduce((sum, [, item]) => sum + item.quantity, 0)
  const subtotal = cartEntries.reduce((sum, [, item]) => sum + item.price * item.quantity, 0)

  const addToCart = (product, quantity = 1, customMessage) => {
    setCart((previousCart) => {
      const existing = previousCart[product.name] || { price: product.price, quantity: 0 }
      return {
        ...previousCart,
        [product.name]: {
          ...existing,
          price: product.price,
          quantity: existing.quantity + quantity
        }
      }
    })

    setToastText(customMessage || `${product.name} added to your bag`)
    setToastVisible(true)
  }

  const handleAccountSubmit = async (event) => {
    event.preventDefault()
    const email = accountForm.email.trim()
    const name = accountForm.name.trim()

    if (accountMode === 'signup' && name.length < 2) {
      setAccountMessage('Please enter your full name.')
      return
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAccountMessage('Please provide a valid email address.')
      return
    }

    setAccountMessage(accountMode === 'signup' ? 'Creating your account...' : 'Signing in...')
    try {
      const apiBase = window.location.protocol === 'file:' ? 'http://localhost:3000' : ''
      const response = await fetch(`${apiBase}/api/auth/${accountMode === 'signup' ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountForm)
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to access your account.')

      setStoredAccount(result.user)
      setAccountMessage(accountMode === 'signup' ? 'Your account is ready.' : 'You are signed in.')
      setAccountForm({ name: '', email: '', password: '' })
    } catch (error) {
      setAccountMessage(error.message || 'Unable to reach the account service. Please try again.')
    }
  }

  const handleCheckout = async () => {
    if (!cartEntries.length) {
      setCheckoutMessage('Add an item before checking out.')
      return
    }

    setCheckoutMessage('Creating your order...')

    try {
      const apiBase = window.location.protocol === 'file:' ? 'http://localhost:3000' : ''
      const response = await fetch(`${apiBase}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cartEntries.map(([name, item]) => ({ name, quantity: item.quantity }))
        })
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to create order.')

      setCheckoutMessage(`Order ${result.order.id} created - total ${currency.format(result.order.total)}.`)
      setCart({})
    } catch (error) {
      setCheckoutMessage('Start the backend with npm start to complete checkout.')
    }
  }

  return (
    <>
      <div className="announcement">FREE SHIPPING ON ORDERS OVER $50 &nbsp; / &nbsp; 30-DAY EASY RETURNS</div>
      <header>
        <nav className="nav shell" aria-label="Main navigation">
          <a className="brand" href="#top" aria-label="MZ Tech Hub home">
            <img src="/logo.svg" alt="MZ Tech Hub logo" className="brand-logo" />
          </a>
          <div className="nav-links">
            <a href="#shop">Shop all</a>
            <a href="#categories">Collections</a>
            <a href="#about">Why MZ Tech HuB</a>
          </div>
          <div className="nav-actions">
            <button className="icon-btn" type="button" aria-label="Search" onClick={() => document.querySelector('.search').focus()}>⌕</button>
            <button
              className="theme-toggle"
              type="button"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={() => setTheme((currentTheme) => currentTheme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <button className="account-btn" type="button" aria-label="Open account" onClick={() => setAccountOpen(true)}>
              {storedAccount?.name ? storedAccount.name.split(' ')[0] : 'Sign in'}
            </button>
            <button className="icon-btn cart-btn" type="button" aria-label="Shopping cart" onClick={() => setCartOpen(true)}>
              ♧
              <span className="cart-count">{totalItems}</span>
            </button>
          </div>
        </nav>
      </header>

      <main id="top">
        <section className="hero shell">
          <div className="hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">Everyday tech, considered</p>
              <h1>Premium gear for the way you live, work, and move.</h1>
              <p>Upgrade your everyday setup with sleek accessories built for speed, style, and smarter routines.</p>
              <div className="hero-actions">
                <a className="primary-btn" href="#shop">Shop now <span aria-hidden="true">→</span></a>
                <a className="secondary-btn" href="#about">Explore more</a>
              </div>
              <div className="mini-trust">
                <span>4.9/5 customer rating</span>
                <span>Free shipping over $50</span>
              </div>
            </div>
            <div className="hero-art" aria-label="Real iPhone product render">
              <div className="floating-card card-one">
                <strong>4.9/5</strong>
                <span>trusted by shoppers</span>
              </div>
              <div className="floating-card card-two">
                <strong>12k+</strong>
                <span>happy customers</span>
              </div>
              <div className="iphone-hero" aria-hidden="true">
                <img
                  className="iphone-photo"
                  src="/images/hero-phone-laptop-mz.jpg"
                  alt="MZ Tech Hub storefront displayed on a smartphone beside a laptop"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="section shell trust-strip" aria-label="Brand highlights">
          <div className="trust-item"><strong>12k+</strong><span>customers served</span></div>
          <div className="trust-item"><strong>48h</strong><span>fast dispatch</span></div>
          <div className="trust-item"><strong>30-day</strong><span>easy returns</span></div>
          <div className="trust-item"><strong>Top rated</strong><span>quality accessories</span></div>
        </section>

        <section className="section shell" id="categories">
          <div className="section-head">
            <h2>Find your fit</h2>
            <p>Small upgrades. Noticeable difference.</p>
          </div>
          <div className="category-list">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className="category"
                onClick={() => {
                  const nextFilter = category.id === 'all' ? 'all' : category.id
                  setActiveFilter(nextFilter)
                  setSearchTerm('')
                  setTimeout(() => document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
                }}
              >
                <span className="category-icon">{category.icon}</span>
                <strong>{category.label}</strong>
                <span>{category.description}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="section shell" id="shop">
          <div className="section-head">
            <h2>Popular right now</h2>
            <p>Curated essentials for your setup.</p>
          </div>
          <div className="shop-bar">
            <div className="filters">
              {['all', 'cases', 'audio', 'power', 'wearables', 'workspace'].map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={`filter ${activeFilter === filter ? 'active' : ''}`}
                  data-filter={filter}
                  onClick={() => setActiveFilter(filter)}
                >
                  {filter === 'all' ? 'All products' : filter === 'cases' ? 'Cases' : filter === 'audio' ? 'Audio' : filter === 'power' ? 'Power' : filter === 'wearables' ? 'Wearables' : 'Laptop & Desk'}
                </button>
              ))}
            </div>
            <label className="search-wrap">
              <span aria-hidden="true">⌕</span>
              <input
                className="search"
                type="search"
                placeholder="Search products..."
                aria-label="Search products"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              {searchTerm ? (
                <button className="clear-search" type="button" aria-label="Clear search" onClick={() => setSearchTerm('')}>
                  ×
                </button>
              ) : null}
            </label>
          </div>

          <div className="products">
            {visibleProducts.map((product) => (
              <article key={product.id} className="product" data-category={product.category} data-name={product.name}>
                <div className="product-visual">
                  {product.badge ? <span className="badge">{product.badge}</span> : null}
                  <img src={product.image} alt={product.name} />
                  <div className="visual-shape" />
                </div>
                <div className="product-info">
                  <h3>{product.name}</h3>
                  <div className="product-meta">
                    <span className="price">{currency.format(product.price)}</span>
                    <span className="stars">★★★★★</span>
                  </div>
                  <button
                    type="button"
                    className={`add${cart[product.name]?.quantity ? ' is-added' : ''}`}
                    onClick={() => addToCart(product, 1)}
                  >
                    Add to cart
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!visibleProducts.length ? <p className="no-results">No products found. Try another search.</p> : null}
        </section>

        <section className="feature-band" id="about">
          <div className="shell features">
            <div className="feature">
              <span className="feature-icon">✦</span>
              <div>
                <h3>Built to last</h3>
                <p>Reliable materials and considered details, tested for real life.</p>
              </div>
            </div>
            <div className="feature">
              <span className="feature-icon">↗</span>
              <div>
                <h3>Easy on the planet</h3>
                <p>Plastic-free packaging and less waste, from our door to yours.</p>
              </div>
            </div>
            <div className="feature">
              <span className="feature-icon">♡</span>
              <div>
                <h3>Help when you need it</h3>
                <p>Friendly humans are ready to help with your setup.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="shell footer-inner">
          <span>© 2026 MZ Tech Hub</span>
          <span>Made for the way you connect.</span>
        </div>
      </footer>

      <div className={`toast ${toastVisible ? 'show' : ''}`} role="status" aria-live="polite">{toastText}</div>

      <aside className={`cart-drawer ${cartOpen ? 'open' : ''}`} aria-label="Shopping cart" aria-hidden={!cartOpen}>
        <div className="cart-header">
          <h2>Your bag</h2>
          <button className="close-cart" type="button" aria-label="Close shopping cart" onClick={() => setCartOpen(false)}>×</button>
        </div>
        <div className="cart-items">
          {!cartEntries.length ? (
            <p className="empty-cart">Your bag is waiting for something good.</p>
          ) : (
            cartEntries.map(([name, item]) => (
              <div key={name} className="cart-item">
                <div>
                  <strong>{name}</strong>
                  <span>{currency.format(item.price)} each</span>
                </div>
                <div className="quantity">
                  <button type="button" data-cart-action="decrease" onClick={() => setCart((previousCart) => {
                    const next = { ...previousCart }
                    const entry = next[name]
                    if (!entry) return previousCart
                    if (entry.quantity <= 1) {
                      delete next[name]
                    } else {
                      next[name] = { ...entry, quantity: entry.quantity - 1 }
                    }
                    return next
                  })} aria-label={`Decrease ${name}`}>−</button>
                  <span>{item.quantity}</span>
                  <button type="button" data-cart-action="increase" onClick={() => setCart((previousCart) => ({
                    ...previousCart,
                    [name]: {
                      ...previousCart[name],
                      quantity: (previousCart[name]?.quantity || 0) + 1
                    }
                  }))} aria-label={`Increase ${name}`}>+</button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="cart-summary">
          <div>
            <span>Subtotal</span>
            <strong className="cart-subtotal">{currency.format(subtotal)}</strong>
          </div>
          <button className="checkout" type="button" onClick={handleCheckout}>Checkout</button>
          <p className="checkout-message" role="status">{checkoutMessage}</p>
        </div>
      </aside>

      <div className={`cart-overlay ${cartOpen ? 'open' : ''}`} aria-hidden={!cartOpen} onClick={() => setCartOpen(false)} />

      <div className={`account-overlay ${accountOpen ? 'open' : ''}`} aria-hidden={!accountOpen} onClick={(event) => {
        if (event.target === event.currentTarget) setAccountOpen(false)
      }}>
        <section className="account-modal" id="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title" aria-hidden={!accountOpen}>
          <button className="close-account" type="button" aria-label="Close account dialog" onClick={() => setAccountOpen(false)}>×</button>
          <div className="account-heading">
            <span className="eyebrow">Your MZ account</span>
            <h2 id="account-title">{accountMode === 'signup' ? 'Make it yours' : 'Welcome back'}</h2>
            <p className="account-intro">Save your details and keep your favorite gear close.</p>
          </div>
          <div className="account-tabs" role="tablist" aria-label="Account access">
            <button type="button" className={`account-tab ${accountMode === 'signin' ? 'active' : ''}`} role="tab" aria-selected={accountMode === 'signin'} onClick={() => setAccountMode('signin')}>Sign in</button>
            <button type="button" className={`account-tab ${accountMode === 'signup' ? 'active' : ''}`} role="tab" aria-selected={accountMode === 'signup'} onClick={() => setAccountMode('signup')}>Create account</button>
          </div>

          {!storedAccount ? (
            <form className="account-form" onSubmit={handleAccountSubmit}>
              <label className={accountMode === 'signup' ? 'name-field' : 'name-field hidden'}>
                Full name
                <input
                  name="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Alex Morgan"
                  value={accountForm.name}
                  onChange={(event) => setAccountForm((previous) => ({ ...previous, name: event.target.value }))}
                  required={accountMode === 'signup'}
                />
              </label>
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={accountForm.email}
                  onChange={(event) => setAccountForm((previous) => ({ ...previous, email: event.target.value }))}
                  required
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete={accountMode === 'signin' ? 'current-password' : 'new-password'}
                  placeholder="At least 8 characters"
                  minLength={8}
                  value={accountForm.password}
                  onChange={(event) => setAccountForm((previous) => ({ ...previous, password: event.target.value }))}
                  required
                />
              </label>
              <p className="account-message" role="status">{accountMessage}</p>
              <button className="account-submit primary-btn" type="submit">{accountMode === 'signup' ? 'Create account' : 'Sign in'}</button>
            </form>
          ) : (
            <>
              <p className="account-message" role="status">Signed in as {storedAccount.email}.</p>
              <button className="sign-out" type="button" onClick={() => setStoredAccount(null)}>Sign out</button>
            </>
          )}
        </section>
      </div>
    </>
  )
}

export default App
