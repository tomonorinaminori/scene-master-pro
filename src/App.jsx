import React, { useState, useEffect } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken,
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  onSnapshot, 
  deleteDoc,
  query
} from 'firebase/firestore';
import { 
  MessageCircle, 
  Send, 
  BookOpen, 
  Loader2, 
  Home, 
  Star, 
  Trash2, 
  Sparkles, 
  CheckCircle2,
  AlertCircle,
  Bug
} from 'lucide-react';

/**
 * 【エラー修正版】
 * 1. ビルド警告の解消: es2015環境での import.meta エラーを回避するため、
 * 実行時に安全にプロパティをチェックするヘルパーを導入しました。
 * 2. 指示通りのAI API利用: 指示されたURL、モデル、および指数バックオフを実装。
 * 3. Firestore RULE遵守: ルール1(パス)、ルール2(クエリ制限)、ルール3(認証優先)を厳守。
 * 4. デザイン: 常に中央配置されるレスポンシブデザイン。
 */

// 環境変数を安全に取得するためのヘルパー (ビルド時の静的解析エラーを回避)
const getEnv = (key) => {
  try {
    // Vite環境での静的置換を期待しつつ、未定義環境でもエラーにならないようガード
    const meta = typeof import.meta !== 'undefined' ? import.meta : {};
    const env = meta.env || {};
    return env[key] || "";
  } catch (e) {
    return "";
  }
};

// --- Firebase設定 ---
const firebaseConfig = {
  apiKey: getEnv("VITE_FIREBASE_API_KEY"),
  authDomain: getEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: getEnv("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: getEnv("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: getEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: getEnv("VITE_FIREBASE_APP_ID")
};

// Canvas プレビュー環境用の設定優先
const isCanvas = typeof __app_id !== 'undefined';
const finalConfig = isCanvas ? JSON.parse(__firebase_config) : firebaseConfig;
const appId = isCanvas ? __app_id : 'scene-master-pro-v1';

// Firebase初期化
let firebaseApp;
let auth;
let db;
try {
  firebaseApp = !getApps().length ? initializeApp(finalConfig) : getApp();
  auth = getAuth(firebaseApp);
  db = getFirestore(firebaseApp);
} catch (e) {
  console.error("Firebase init failed:", e);
}

const App = () => {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing');
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(null);
  const [result, setResult] = useState(null);
  const [vocabList, setVocabList] = useState([]);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [showDebug, setShowDebug] = useState(false);

  // 1. ログイン認証 (RULE 3: 認証を優先して待機)
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error:", err);
        setError(`ログインエラー: ${err.code || err.message}`);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. 単語帳の同期 (RULE 1: パス厳守 / RULE 3: userの存在を確認)
  useEffect(() => {
    if (!user || !db) return;
    // Private path: /artifacts/{appId}/users/{userId}/{collectionName}
    const vocabCol = collection(db, 'artifacts', appId, 'users', user.uid, 'vocabulary');
    const unsubscribe = onSnapshot(vocabCol, 
      (snapshot) => {
        setVocabList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (err) => {
        console.error("Firestore Error:", err);
      }
    );
    return () => unsubscribe();
  }, [user]);

  // AI生成 (指数バックオフを伴うFetch)
  const generateContent = async () => {
    if (!userInput.trim()) return;
    setIsLoading(true);
    setError(null);
    setResult(null);

    const apiKey = ""; // Canvas環境では空文字、実際は環境から注入される
    const model = "gemini-2.5-flash-preview-09-2025";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{
        parts: [{ 
          text: `Situation: ${userInput}. 英語コーチとして、AとBの自然な会話（4-6往復）と、その中で使われている重要フレーズを抽出してください。` 
        }]
      }],
      systemInstruction: {
        parts: [{ 
          text: "Respond only in valid JSON format: { \"title\": \"string\", \"context\": \"string\", \"dialogue\": [{ \"speaker\": \"A/B\", \"english\": \"string\", \"japanese\": \"string\" }], \"key_phrases\": [{ \"phrase\": \"string\", \"meaning\": \"string\" }] }" 
        }]
      },
      generationConfig: { responseMimeType: "application/json" }
    };

    const fetchWithRetry = async (retries = 5, delay = 1000) => {
      for (let i = 0; i < retries; i++) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (response.ok) return await response.json();
          if (response.status !== 429 && response.status < 500) {
            throw new Error(`API Error: ${response.status}`);
          }
        } catch (e) {
          if (i === retries - 1) throw e;
        }
        await new Promise(res => setTimeout(res, delay));
        delay *= 2;
      }
    };

    try {
      const data = await fetchWithRetry();
      const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!aiResponse) throw new Error("AIからの応答が空です。");
      
      const parsed = JSON.parse(aiResponse);
      setResult(parsed);
      setUserInput("");
    } catch (err) {
      console.error("Generate Error:", err);
      setError("会話の生成に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setIsLoading(false);
    }
  };

  // 単語保存 (Firestore)
  const saveToVocab = async (item, index) => {
    if (!user || !db) return;
    // 既知の重複チェック（メモリ上で行う RULE 2）
    if (vocabList.some(v => v.phrase === item.phrase)) {
      setSuccessMsg("保存済み");
      setTimeout(() => setSuccessMsg(null), 2000);
      return;
    }
    setIsSaving(index);
    try {
      const vocabCol = collection(db, 'artifacts', appId, 'users', user.uid, 'vocabulary');
      await addDoc(vocabCol, { ...item, createdAt: new Date().toISOString() });
      setSuccessMsg("単語帳に追加しました");
      setTimeout(() => setSuccessMsg(null), 2000);
    } catch (err) {
      setError("保存に失敗しました。");
    } finally {
      setIsSaving(null);
    }
  };

  const deleteVocab = async (id) => {
    if (!user || !db) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocabulary', id));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh', color: '#0f172a', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      {/* 画面中央配置のためのスタイル */}
      <style>{`
        body { margin: 0; background-color: #f8fafc !important; color: #0f172a !important; display: flex; justify-content: center; width: 100%; overflow-x: hidden; }
        #root { width: 100%; display: flex; flex-direction: column; align-items: center; }
        .bg-white { background-color: white !important; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
        * { box-sizing: border-box; }
      `}</style>

      <nav className="bg-white" style={{ borderBottom: '1px solid #e2e8f0', padding: '15px 20px', position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', maxWidth: '500px', width: '100%' }} onClick={() => setView('landing')}>
          <div style={{ backgroundColor: '#4f46e5', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>S</div>
          <span style={{ fontWeight: 'bold', fontSize: '18px', color: '#0f172a' }}>SceneMaster Pro</span>
        </div>
      </nav>

      <main style={{ maxWidth: '500px', width: '100%', padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {view === 'landing' && (
          <div style={{ textAlign: 'center', padding: '80px 0', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ backgroundColor: '#4f46e5', width: '80px', height: '80px', borderRadius: '24px', marginBottom: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 20px rgba(79, 70, 229, 0.2)' }}>
              <Sparkles style={{ color: 'white', width: '40px', height: '40px' }} />
            </div>
            <h1 style={{ fontSize: '32px', fontWeight: '900', marginBottom: '10px', color: '#0f172a' }}>English Master</h1>
            <p style={{ color: '#64748b', marginBottom: '40px', fontSize: '18px' }}>状況を伝えるだけで、会話を生成。</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '100%', maxWidth: '300px' }}>
              <button onClick={() => setView('generator')} style={{ backgroundColor: '#4f46e5', color: 'white', border: 'none', padding: '18px', borderRadius: '16px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', boxShadow: '0 4px 6px rgba(79, 70, 229, 0.3)' }}>会話を生成する</button>
              <button onClick={() => setView('vocab')} style={{ backgroundColor: 'white', color: '#475569', border: '1px solid #e2e8f0', padding: '18px', borderRadius: '16px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}>My 単語帳</button>
            </div>
          </div>
        )}

        {view === 'generator' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
            <div className="bg-white" style={{ padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#4f46e5', display: 'block', marginBottom: '8px' }}>状況を入力 (例: カフェで注文)</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="text" 
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && generateContent()}
                  placeholder="Situation..."
                  style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#f1f5f9', outline: 'none', color: '#0f172a', fontSize: '16px' }}
                />
                <button onClick={generateContent} disabled={isLoading} style={{ backgroundColor: '#4f46e5', color: 'white', border: 'none', padding: '14px', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '50px' }}>
                  {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                </button>
              </div>
            </div>

            {result && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '100px', width: '100%' }}>
                <div style={{ backgroundColor: '#1e293b', color: 'white', padding: '20px', borderRadius: '20px' }}>
                  <h3 style={{ margin: '0 0 5px 0', fontSize: '18px' }}>{result.title}</h3>
                  <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>{result.context}</p>
                </div>
                
                {result.dialogue?.map((line, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: line.speaker === 'A' ? 'flex-start' : 'flex-end', width: '100%' }}>
                    <div style={{ maxWidth: '85%', padding: '15px', borderRadius: '18px', backgroundColor: line.speaker === 'A' ? 'white' : '#4f46e5', color: line.speaker === 'A' ? '#0f172a' : 'white', border: line.speaker === 'A' ? '1px solid #e2e8f0' : 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                      <span style={{ fontSize: '10px', fontWeight: 'bold', opacity: 0.6, display: 'block', marginBottom: '4px' }}>{line.speaker}</span>
                      <p style={{ margin: '0', fontWeight: 'bold', fontSize: '16px' }}>{line.english}</p>
                      <p style={{ margin: '8px 0 0 0', fontSize: '12px', borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: '8px' }}>{line.japanese}</p>
                    </div>
                  </div>
                ))}

                <div className="bg-white" style={{ borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden', width: '100%' }}>
                  <div style={{ backgroundColor: '#f8fafc', padding: '12px 20px', borderBottom: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 'bold' }}>重要フレーズ</div>
                  {result.key_phrases?.map((item, i) => (
                    <div key={i} style={{ padding: '15px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontWeight: 'bold', color: '#4f46e5', fontSize: '16px' }}>{item.phrase}</p>
                        <p style={{ margin: 0, fontSize: '13px', color: '#475569' }}>{item.meaning}</p>
                      </div>
                      <button onClick={() => saveToVocab(item, i)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px' }}>
                        {isSaving === i ? <Loader2 className="animate-spin" size={24} color="#4f46e5" /> : vocabList.some(v => v.phrase === item.phrase) ? <Star size={24} color="#f59e0b" fill="#f59e0b" /> : <Star size={24} color="#cbd5e1" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'vocab' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '100%' }}>
            <h2 style={{ fontSize: '28px', fontWeight: '900' }}>My Vocab</h2>
            {vocabList.length === 0 ? (
              <div className="bg-white" style={{ textAlign: 'center', padding: '80px 20px', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '24px' }}>単語帳は空です。</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '100px', width: '100%' }}>
                {vocabList.map(item => (
                  <div key={item.id} className="bg-white" style={{ padding: '20px', borderRadius: '18px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 'bold', fontSize: '18px' }}>{item.phrase}</p>
                      <p style={{ margin: '2px 0 0 0', fontSize: '14px', color: '#4f46e5', fontWeight: 'bold' }}>{item.meaning}</p>
                    </div>
                    <button onClick={() => deleteVocab(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1' }}><Trash2 size={22}/></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ボトムナビ */}
      <div style={{ position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', width: '85%', maxWidth: '350px', backgroundColor: 'rgba(15, 23, 42, 0.95)', borderRadius: '50px', padding: '10px', display: 'flex', justifyContent: 'space-around', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.4)', zIndex: 100 }}>
        <button onClick={() => setView('landing')} style={{ padding: '12px', borderRadius: '50%', backgroundColor: view === 'landing' ? '#4f46e5' : 'transparent', color: view === 'landing' ? 'white' : '#94a3b8', border: 'none', cursor: 'pointer' }}><Home size={26}/></button>
        <button onClick={() => setView('generator')} style={{ padding: '12px', borderRadius: '50%', backgroundColor: view === 'generator' ? '#4f46e5' : 'transparent', color: view === 'generator' ? 'white' : '#94a3b8', border: 'none', cursor: 'pointer' }}><MessageCircle size={26}/></button>
        <button onClick={() => setView('vocab')} style={{ padding: '12px', borderRadius: '50%', backgroundColor: view === 'vocab' ? '#4f46e5' : 'transparent', color: view === 'vocab' ? 'white' : '#94a3b8', border: 'none', cursor: 'pointer' }}><BookOpen size={26}/></button>
        <button onClick={() => setShowDebug(!showDebug)} style={{ padding: '12px', borderRadius: '50%', color: '#ef4444', border: 'none', cursor: 'pointer', background: 'none' }}><Bug size={26}/></button>
      </div>

      {/* メッセージ表示 */}
      {error && (
        <div style={{ position: 'fixed', bottom: '110px', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '400px', backgroundColor: '#1e293b', color: 'white', padding: '15px 20px', borderRadius: '15px', fontSize: '12px', fontWeight: 'bold', zIndex: 1000, display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #ef4444' }}>
          <AlertCircle size={18} color="#ef4444" /> <span>{String(error)}</span>
        </div>
      )}

      {showDebug && (
        <div style={{ position: 'fixed', top: '70px', right: '10px', backgroundColor: 'rgba(0,0,0,0.9)', color: '#4ade80', padding: '15px', borderRadius: '10px', fontSize: '10px', zIndex: 2000, maxWidth: '250px' }}>
          <p>ENV Check: {typeof import.meta !== 'undefined' ? 'Support meta' : 'No meta'}</p>
          <p>FB_KEY: {getEnv("VITE_FIREBASE_API_KEY") ? 'FOUND' : 'EMPTY'}</p>
          <p>USER: {user ? user.uid : 'NO AUTH'}</p>
          <button onClick={() => setShowDebug(false)} style={{ color: 'white', marginTop: '10px' }}>Close</button>
        </div>
      )}

      {successMsg && (
        <div style={{ position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#4f46e5', color: 'white', padding: '10px 25px', borderRadius: '50px', fontSize: '14px', fontWeight: 'bold', zIndex: 1000, boxShadow: '0 10px 15px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={18} /> {successMsg}
        </div>
      )}
    </div>
  );
};

export default App;
