// client/src/App.js
import React, { useState, useEffect } from "react";
import Login from "./components/Login";
import Signup from "./components/Signup";
import Navigation from "./components/Navigation";
import Dashboard from "./components/Dashboard";
import Profile from "./components/Profile";
import History from "./components/History";
import AIAssistant from "./components/AIAssistant";
import ProductRecommendations from "./components/ProductRecommendations";
import Wishlist from "./components/Wishlist";
import BodyShapeAnalysis from "./components/BodyShapeAnalysis";

function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [wardrobe, setWardrobe] = useState([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'signup'
  const [activeTab, setActiveTab] = useState('dashboard'); // Navigation state
  const [wishlist, setWishlist] = useState([]); // Wishlist state
  const [bodyShapeAnalysis, setBodyShapeAnalysis] = useState(null); // Body shape analysis
  const API_BASE = "http://localhost:5001";

  useEffect(() => {
    // Check for existing authentication on mount
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
    }
  }, []);

  useEffect(() => {
    // fetch wardrobe when user is authenticated
    if (user && token) {
      fetchWardrobe();
    }
  }, [user, token]);

  const handleLogin = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setToken(null);
    setWardrobe([]);
    setResult(null);
    setWishlist([]);
    setBodyShapeAnalysis(null);
  };

  const handleAddToWishlist = (product) => {
    setWishlist(prev => {
      const exists = prev.find(item => item.id === product.id);
      if (exists) return prev;
      return [...prev, {
        ...product,
        addedDate: new Date().toISOString().split('T')[0]
      }];
    });
  };

  const handleSaveBodyShapeAnalysis = (analysis) => {
    setBodyShapeAnalysis(analysis);
    // In a real app, you'd save this to your backend
    console.log('Body shape analysis saved:', analysis);
  };

  const handleFileChange = (e) => {
    const chosen = e.target.files[0];
    setFile(chosen);
    setResult(null);
    if (chosen) setPreview(URL.createObjectURL(chosen));
  };

  const normalizeAnalyzeResponse = (data) => {
    // make a normalized object with fields we expect in UI.
    const normalized = {
      dominant: null,
      color: null, // for new result component
      palette: null,
      styleScore: null,
      category: null, // for new result component
      suggestion: null, // for new result component
      products: null,
      imageUrl: null,
      raw: data,
    };

    // dominant color
    if (data?.dominant) normalized.dominant = data.dominant;
    else if (data?.color) normalized.dominant = data.color;
    else if (data?.dominantRgb) normalized.dominant = data.dominantRgb;
    normalized.color = normalized.dominant; // ensure `color` key is populated for new UI

    // palette
    if (data?.palette) normalized.palette = data.palette;

    // styleScore, category, suggestion
    normalized.styleScore = data?.styleScore ?? null;
    normalized.category = data?.category ?? null;
    normalized.suggestion = data?.suggestion ?? null;
    
    // products and imageUrl
    normalized.products = data?.products ?? null;
    normalized.imageUrl = data?.imageUrl ?? null;

    return normalized;
  };

  const handleUpload = async () => {
    if (!file) {
      alert("Please select a file.");
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.append("photo", file);

    try {
      const res = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });

      const data = await res.json();
      console.log("ANALYZE response:", data);
      const norm = normalizeAnalyzeResponse(data);
      setResult(norm);

      // refresh wardrobe after upload
      await fetchWardrobe();
    } catch (err) {
      console.error("Upload error:", err);
      alert("Upload failed — check console and server logs.");
    } finally {
      setLoading(false);
    }
  };

  const fetchWardrobe = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/wardrobe`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      console.log("WARDROBE response:", data);

      const items = data?.items ?? data ?? [];
      const normalizedItems = items.map((it) => {
        const imageUrlRaw = it.imageUrl ?? it.image_url ?? it.image ?? null;
        let imageUrl = imageUrlRaw;
        if (imageUrlRaw && imageUrlRaw.startsWith("/")) imageUrl = `${API_BASE}${imageUrlRaw}`;

        const dominant = it.dominantRgb ?? it.dominant ?? it.dominant_color ?? it.dominantRgb;
        const palette = it.palette ?? it.colorPalette ?? it.palette_json ?? null;
        const styleScore = it.styleScore ?? it.style_score ?? null;
        return {
          id: it.id,
          imageUrl,
          dominant,
          palette,
          styleScore,
          category: it.category ?? null,
        };
      });

      setWardrobe(normalizedItems);
    } catch (err) {
      console.error("Failed to fetch wardrobe:", err);
      setWardrobe([]);
    }
  };

  const handleClearWardrobe = async () => {
    if (!window.confirm("Clear all wardrobe items?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/wardrobe`, { 
        method: "DELETE",
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      console.log("clear response:", data);
      setWardrobe([]);
      alert("Wardrobe cleared.");
    } catch (err) {
      console.error("Clear failed:", err);
      alert("Clear failed — check console.");
    }
  };

  // Show authentication screens if not logged in
  if (!user || !token) {
    if (authMode === 'login') {
      return <Login onLogin={handleLogin} onSwitchToSignup={() => setAuthMode('signup')} />;
    } else {
      return <Signup onLogin={handleLogin} onSwitchToLogin={() => setAuthMode('login')} />;
    }
  }

  // Render different components based on active tab
  const renderActiveTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard user={user} token={token} wishlist={wishlist} />;
      case 'analyze':
        return (
          <div className="max-w-4xl mx-auto p-6 space-y-8">
            {/* File Upload Section */}
            <div className="card-luxury p-8 text-center">
              <div className="mb-6">
                <div className="w-20 h-20 bg-gradient-to-r from-primary-600 to-primary-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <span className="text-white text-3xl">📸</span>
                </div>
                <h2 className="text-3xl font-display font-bold text-neutral-900 mb-2">Upload Your Outfit</h2>
                <p className="text-neutral-600">Take a photo of your outfit and let AI analyze your style</p>
              </div>
              
              <div className="mb-6">
                <label className="btn-primary cursor-pointer inline-block">
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleFileChange} 
                    className="hidden"
                  />
                  📁 Choose Photo
                </label>
              </div>

              {preview && (
                <div className="mb-6 animate-fade-in">
                  <div className="relative inline-block">
                    <img 
                      src={preview} 
                      alt="preview" 
                      className="w-64 h-64 object-cover rounded-2xl shadow-lg border-4 border-neutral-200" 
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap justify-center gap-4">
                <button 
                  onClick={handleUpload} 
                  disabled={loading || !file} 
                  className="btn-success disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {loading ? (
                    <div className="flex items-center">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                      Analyzing...
                    </div>
                  ) : (
                    '🔍 Analyze Outfit'
                  )}
                </button>

                <button 
                  onClick={fetchWardrobe} 
                  className="btn-secondary"
                >
                  🔄 Refresh Wardrobe
                </button>
                
                <button 
                  onClick={handleClearWardrobe} 
                  className="btn-danger"
                >
                  🗑️ Clear Wardrobe
                </button>
              </div>
            </div>

            {/* Results Section */}
            {result && (
              <div className="space-y-8">
                <div className="card-luxury p-8 animate-fade-in">
                  <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-r from-accent-600 to-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                      <span className="text-white text-2xl">✨</span>
                    </div>
                    <h2 className="text-3xl font-display font-bold text-neutral-900 mb-2">Analysis Results</h2>
                    <p className="text-neutral-600">Your outfit has been analyzed by AI</p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-8">
                    {/* Left Column */}
                    <div className="space-y-6">
                      {/* Category */}
                      <div className="card-modern p-6">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-2xl">🏷️</span>
                          <h3 className="text-xl font-semibold text-neutral-900">Category</h3>
                        </div>
                        <p className="text-2xl font-bold text-success-600">{result.category || "N/A"}</p>
                      </div>

                      {/* Dominant Color */}
                      <div className="card-modern p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <span className="text-2xl">🎨</span>
                          <h3 className="text-xl font-semibold text-neutral-900">Dominant Color</h3>
                        </div>
                        <div className="flex items-center gap-4">
                          <div
                            className="w-16 h-16 rounded-2xl border-4 border-neutral-300 shadow-md"
                            style={{
                              backgroundColor: result.color ? `rgb(${result.color})` : '#666',
                            }}
                          ></div>
                          <div>
                            <p className="text-lg font-medium text-neutral-900">RGB</p>
                            <p className="text-sm text-neutral-600 font-mono">
                              {result.color ? `(${result.color.join(', ')})` : 'N/A'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Style Score */}
                      <div className="card-modern p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <span className="text-2xl">⭐</span>
                          <h3 className="text-xl font-semibold text-neutral-900">Style Score</h3>
                        </div>
                        <div className="text-center">
                          <div className="text-4xl font-bold text-accent-600 mb-2">
                            {result.styleScore || 0}/100
                          </div>
                          <div className="w-full bg-neutral-200 h-6 rounded-full overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-accent-500 to-accent-600 h-6 rounded-full transition-all duration-1000 ease-out"
                              style={{ width: `${result.styleScore || 0}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-6">
                      {/* Color Palette */}
                      <div className="card-modern p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <span className="text-2xl">🌈</span>
                          <h3 className="text-xl font-semibold text-neutral-900">Color Palette</h3>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          {result.palette?.map((c, i) => (
                            <div
                              key={i}
                              className="w-full h-16 rounded-xl border-2 border-neutral-200 shadow-sm flex items-center justify-center"
                              style={{
                                backgroundColor: `rgb(${c})`,
                              }}
                            >
                              <span className="text-neutral-600 font-semibold text-xs">
                                {i + 1}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* AI Suggestion */}
                      <div className="card-modern p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <span className="text-2xl">💡</span>
                          <h3 className="text-xl font-semibold text-neutral-900">AI Suggestion</h3>
                        </div>
                        <p className="text-neutral-700 leading-relaxed italic">
                          {result.suggestion || "No specific suggestions available."}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Product Recommendations */}
                <div className="card-luxury p-8">
                  <ProductRecommendations 
                    analysis={result} 
                    user={user} 
                    onAddToWishlist={handleAddToWishlist}
                  />
                </div>
              </div>
            )}
          </div>
        );
      case 'wardrobe':
        return (
          <div className="max-w-6xl mx-auto p-6">
            {/* Wardrobe Section */}
            <div className="text-center mb-8 animate-fade-in">
              <div className="flex items-center justify-center gap-4 mb-4">
                <div className="w-12 h-12 bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-white text-2xl">👕</span>
                </div>
                <h2 className="text-4xl font-display font-bold text-neutral-900">
                  My Wardrobe
                </h2>
              </div>
              <p className="text-neutral-600 font-medium">Your AI-analyzed clothing collection</p>
            </div>

            {wardrobe.length === 0 ? (
              <div className="card-luxury p-12 text-center animate-fade-in">
                <div className="w-24 h-24 bg-gradient-to-r from-neutral-400 to-neutral-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <span className="text-4xl text-white">📂</span>
                </div>
                <h3 className="text-2xl font-semibold mb-2 text-neutral-900">Empty Wardrobe</h3>
                <p className="text-neutral-600">Upload your first outfit to start building your AI-powered wardrobe!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {wardrobe.map((item, index) => (
                  <div 
                    key={item.id} 
                    className="card-luxury p-4 text-center relative group animate-slide-up"
                    style={{animationDelay: `${index * 0.1}s`}}
                  >
                    {/* Image */}
                    <div className="relative mb-4 overflow-hidden rounded-xl">
                      <img 
                        src={item.imageUrl} 
                        alt="clothing" 
                        className="w-full h-48 object-cover transition-transform duration-300 group-hover:scale-105" 
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    </div>

                    {/* Color Display */}
                    <div className="flex items-center justify-center gap-3 mb-3">
                      <span className="text-sm font-medium text-neutral-600">Color:</span>
                      <div 
                        className="w-8 h-8 rounded-lg border-2 border-neutral-300 shadow-sm"
                        style={{
                          backgroundColor: item.dominant ? `rgb(${item.dominant})` : "#666"
                        }}
                      ></div>
                    </div>

                    {/* Category */}
                    <div className="mb-2">
                      <p className="text-sm text-neutral-600">Category</p>
                      <p className="font-semibold text-success-600">
                        {item.category ?? "N/A"}
                      </p>
                    </div>

                    {/* Style Score */}
                    <div className="mb-4">
                      <p className="text-sm text-neutral-600">Style Score</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-neutral-200 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-accent-500 to-accent-600 h-2 rounded-full transition-all duration-1000"
                            style={{ width: `${item.styleScore || 0}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-bold text-accent-600">
                          {item.styleScore || 0}
                        </span>
                      </div>
                    </div>

                    {/* Delete Button */}
                    <button
                      onClick={async () => {
                        if (!window.confirm('Delete this item from your wardrobe?')) return;
                        try {
                          const resp = await fetch(`${API_BASE}/api/wardrobe/${item.id}`, { 
                            method: 'DELETE',
                            headers: {
                              'Authorization': `Bearer ${token}`
                            }
                          });
                          const json = await resp.json();
                          if (json.ok) {
                            setWardrobe((w) => w.filter((x) => x.id !== item.id));
                          } else {
                            alert('Delete failed');
                            console.error(json);
                          }
                        } catch (e) {
                          console.error('Delete error:', e);
                          alert('Delete failed — check console.');
                        }
                      }}
                      className="absolute top-3 right-3 w-8 h-8 bg-red-500 hover:bg-red-600 rounded-lg flex items-center justify-center text-white transition-all duration-300 hover:scale-110 opacity-0 group-hover:opacity-100"
                      title="Delete Item"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case 'history':
        return <History user={user} token={token} />;
      case 'wishlist':
        return <Wishlist user={user} token={token} wishlist={wishlist} />;
      case 'profile':
        return (
          <div className="space-y-8">
            <Profile user={user} token={token} />
            {!bodyShapeAnalysis && (
              <div className="max-w-4xl mx-auto p-6">
                <div className="card-luxury p-6 text-center">
                  <h3 className="text-xl font-semibold text-neutral-900 mb-2">Complete Your Style Profile</h3>
                  <p className="text-neutral-600 mb-4">Get personalized recommendations based on your body shape and preferences</p>
                  <button 
                    onClick={() => setActiveTab('body-analysis')}
                    className="btn-primary"
                  >
                    Start Body Shape Analysis
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      case 'body-analysis':
        return <BodyShapeAnalysis user={user} onSaveAnalysis={handleSaveBodyShapeAnalysis} />;
      case 'assistant':
        return <AIAssistant user={user} token={token} />;
      default:
        return <Dashboard user={user} token={token} />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-neutral-100">
      <Navigation 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        user={user} 
        onLogout={handleLogout} 
      />
      <main className="min-h-screen pt-4">
        {renderActiveTab()}
      </main>
    </div>
  );
}

export default App;