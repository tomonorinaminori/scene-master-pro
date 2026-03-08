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
 * 【ログイン・ビルド・左右ズレ完全解決版】
 * 1. ビルド警告回避: es2015環境での import.meta エラーを防ぐため、
 * typeof チェックと安全なプロパティアクセスを組み合わせています。
 * 2. Vite本番対応: Viteがビルド時に置換を行えるよう、`import.meta.env.VITE_...` の形式を維持。
 * 3. 認証エラー対策: 万が一環境変数が空の場合のフォールバック値を強化し、
 * 認証失敗（api-key-not-valid）を物理的に防ぎます。
 * 4. 左右ズレ解消: body と root レベルで flex 制御を行い、常に画面中央に配置されるよう修正。
 * 5. 2025-12-12 リクエスト機能: 単語帳保存機能を Firestore (RULE 1-3) に基づき完備。
 */

// --- Firebase設定 (Vite置換を成功させつつ、エラーを回避する記述) ---
const getViteKey = (key, fallback) => {
  try {
    // 実行環境が import.meta をサポートしていない場合でもクラッシュしないようにガード
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return import.meta.env[key] || fallback;
    }
    return fallback;
  } catch (e) {
    return fallback;
  }
};

const firebaseConfig = {
  // Viteは静的解析で import.meta.env.VITE_... を探すため、リテラルを含める必要があります
  apiKey: (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_FIREBASE_API_KEY) || "AIzaSyC2jNMTWAS8Lx5zQGki6bIr8Hjo2WzKw2c",
  authDomain: (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) || "scene-master-pro.firebaseapp.com",
  projectId: (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_FIREBASE_PROJECT_ID) || "scene-master-pro",
  storageBucket: (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) || "scene-master-pro.firebasestorage.app",
  messagingSenderId: (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) || "116431796651",
  appId: (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_FIREBASE_APP_ID) || "1:116431796651:web:fbde030210b2f993dbfaee"
};

// Canvas環境用の優先設定
const isCanvasEnv = typeof __app_id !== 'undefined';
const finalConfig = isCanvasEnv ? JSON.parse(__firebase_config) : firebaseConfig;
const appId = isCanvasEnv ? __app_id : 'scene-master-pro-v1';

// --- Firebase初期化 ---
let firebaseApp = null;
let auth = null;
let db = null;

try {
  firebaseApp = getApps().length ? getApp() : initializeApp(finalConfig);
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

  // 1. ログイン認証 (RULE 3: 認証を最優先し、それまでFirestoreを呼ばない)
  useEffect(() => {
    if (!auth) {
      setError("Firebaseの初期化に失敗しました。APIキー等を確認してください。");
      return;
    }

    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          // 匿名認証。Firebase Consoleで「匿名認証」が有効である必要があります。
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error:", err);
        setError(`ログイン失敗: ${err.code} - APIキー設定を確認してください。`);
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. 単語帳の同期 (RULE 1: パス厳守)
  useEffect(() => {
    if (!user || !db) return;
    const vocabCol = collection(db, 'artifacts', appId, 'users', user.uid, 'vocabulary');
    const unsubscribe = onSnapshot(vocabCol, (snapshot) => {
      setVocabList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error("Firestore sync error:", err);
    });
    return () => unsubscribe();
  }, [user]);

  // AI生成 (Gemini API)
  const generateContent = async () => {
    if (!userInput.trim()) return;
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const envKey = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY);
      const geminiKey = isCanvasEnv ? (typeof apiKey !== 'undefined' ? apiKey : "") : (envKey || "AIzaSyDPSMOMuarm6-aSEwRsLTyJmo0jKVnThxw");
      
      if (!geminiKey && !isCanvasEnv) {
        throw new Error("Gemini APIキーが設定されていません。VercelのEnvironment Variablesを確認してください。");
      }

      const cleanKey = String(geminiKey).replace(/['"]+/g, '').trim();
      const model = "gemini-2.5-flash-preview-09-2025"; 
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Situation: ${userInput}. 英語コーチとして、AとBの自然な英会話（4-6往復）と、その中で使われている重要フレーズを抽出してください。` }] }],
          systemInstruction: { parts: [{ text: "JSON形式で回答してください: {title, context, dialogue: [{speaker, english, japanese}], key_phrases: [{phrase, meaning}]}" }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(`AIサーバー通信失敗 (${response.status})`);
      }

      const data = JSON.parse(responseText);
      const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = JSON.parse(aiResponse.replace(/```json/g, "").replace(/```/g, "").trim());
      setResult(parsed);
      setUserInput("");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const saveToVocab = async (item, index) => {
    if (!user || !db) return;
    if (vocabList.some(v => v.phrase === item.phrase)) {
      setSuccessMsg("保存済み");
      setTimeout(() => setSuccessMsg(null), 2000);
      return;
    }
    setIsSaving(index);
    try {
      const vocabCol = collection(db, 'artifacts', appId, 'users', user.uid, 'vocabulary');
      await addDoc(vocabCol, { ...item, createdAt: new Date().toISOString() });
      setSuccessMsg("保存しました！");
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
      {/* 画面の中央配置を保証し、ブラウザの干渉をリセットする */}
      <style>{`
        body { margin: 0; background-color: #f8fafc !important; color: #0f172a !important; display: flex; justify-content: center; width: 100%; overflow-x: hidden; }
        #root { width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; }
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
            <h1 style={{ fontSize: '36px', fontWeight: '900', marginBottom: '10px', color: '#0f172a' }}>English Master</h1>
            <p style={{ color: '#64748b', marginBottom: '40px', fontSize: '18px' }}>呟くだけで、英会話を生成。</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '100%', maxWidth: '300px' }}>
              <button onClick={() => setView('generator')} style={{ backgroundColor: '#4f46e5', color: 'white', border: 'none', padding: '18px', borderRadius: '16px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', boxShadow: '0 4px 6px rgba(79, 70, 229, 0.3)' }}>会話を生成する</button>
              <button onClick={() => setView('vocab')} style={{ backgroundColor: 'white', color: '#475569', border: '1px solid #e2e8f0', padding: '18px', borderRadius: '16px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}>My 単語帳</button>
            </div>
          </div>
        )}

        {view === 'generator' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
            <div className="bg-white" style={{ padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#4f46e5', display: 'block', marginBottom: '8px' }}>状況を入力</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="text" 
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && generateContent()}
                  placeholder="例: スタバで注文..."
                  style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#f1f5f9', outline: 'none', color: '#0f172a', fontSize: '16px' }}
                />
                <button onClick={generateContent} disabled={isLoading} style={{ backgroundColor: '#4f46e5', color: 'white', border: 'none', padding: '14px', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '50px' }}>
                  {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                </button>
              </div>
            </div>

            {result && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '100px', width: '100%' }}>
                <div style={{ backgroundColor: '#1e293b', color: 'white', padding: '20px', borderRadius: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                  <h3 style={{ margin: '0 0 5px 0', fontSize: '18px' }}>{result.title}</h3>
                  <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>{result.context}</p>
                </div>
                
                {result.dialogue?.map((line, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: i % 2 === 0 ? 'flex-start' : 'flex-end', width: '100%' }}>
                    <div style={{ maxWidth: '85%', padding: '15px', borderRadius: '18px', backgroundColor: i % 2 === 0 ? 'white' : '#4f46e5', color: i % 2 === 0 ? '#0f172a' : 'white', border: i % 2 === 0 ? '1px solid #e2e8f0' : 'none', borderLeft: i % 2 === 0 ? '4px solid #4f46e5' : 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                      <span style={{ fontSize: '10px', fontWeight: 'bold', opacity: 0.6, display: 'block', marginBottom: '4px' }}>{line.speaker}</span>
                      <p style={{ margin: '0', fontWeight: 'bold', fontSize: '16px', lineHeight: 1.4 }}>{line.english}</p>
                      <p style={{ margin: '8px 0 0 0', fontSize: '12px', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '8px' }}>{line.japanese}</p>
                    </div>
                  </div>
                ))}

                <div className="bg-white" style={{ borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden', width: '100%' }}>
                  <div style={{ backgroundColor: '#f8fafc', padding: '12px 20px', borderBottom: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 'bold', color: '#0f172a' }}>重要フレーズ</div>
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
            <h2 style={{ fontSize: '28px', fontWeight: '900', color: '#0f172a' }}>My Vocab</h2>
            {vocabList.length === 0 ? (
              <div className="bg-white" style={{ textAlign: 'center', padding: '80px 20px', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '24px', width: '100%' }}>単語帳は空です。</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '100px', width: '100%' }}>
                {vocabList.map(item => (
                  <div key={item.id} className="bg-white" style={{ padding: '20px', borderRadius: '18px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', width: '100%' }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 'bold', fontSize: '18px', color: '#0f172a' }}>{item.phrase}</p>
                      <p style={{ margin: '2px 0 0 0', fontSize: '14px', color: '#4f46e5', fontWeight: 'bold' }}>{item.meaning}</p>
                    </div>
                    <button onClick={() => deleteVocab(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '10px' }}><Trash2 size={22}/></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <div style={{ position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', width: '85%', maxWidth: '350px', backgroundColor: 'rgba(15, 23, 42, 0.95)', borderRadius: '50px', padding: '10px', display: 'flex', justifyContent: 'space-around', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.4)', zIndex: 100 }}>
        <button onClick={() => setView('landing')} style={{ padding: '12px', borderRadius: '50%', backgroundColor: view === 'landing' ? '#4f46e5' : 'transparent', color: view === 'landing' ? 'white' : '#94a3b8', border: 'none', cursor: 'pointer' }}><Home size={26}/></button>
        <button onClick={() => setView('generator')} style={{ padding: '12px', borderRadius: '50%', backgroundColor: view === 'generator' ? '#4f46e5' : 'transparent', color: view === 'generator' ? 'white' : '#94a3b8', border: 'none', cursor: 'pointer' }}><MessageCircle size={26}/></button>
        <button onClick={() => setView('vocab')} style={{ padding: '12px', borderRadius: '50%', backgroundColor: view === 'vocab' ? '#4f46e5' : 'transparent', color: view === 'vocab' ? 'white' : '#94a3b8', border: 'none', cursor: 'pointer' }}><BookOpen size={26}/></button>
        <button onClick={() => setShowDebug(!showDebug)} style={{ padding: '12px', borderRadius: '50%', color: '#ef4444', border: 'none', cursor: 'pointer', background: 'none' }}><Bug size={26}/></button>
      </div>

      {error && (
        <div style={{ position: 'fixed', bottom: '110px', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '400px', backgroundColor: '#1e293b', color: 'white', padding: '15px 20px', borderRadius: '15px', fontSize: '12px', fontWeight: 'bold', zIndex: 1000, display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #ef4444' }}>
          <AlertCircle size={18} color="#ef4444" /> <span>{String(error)}</span>
        </div>
      )}

      {showDebug && (
        <div style={{ position: 'fixed', top: '70px', right: '10px', backgroundColor: 'rgba(0,0,0,0.85)', color: '#4ade80', padding: '15px', borderRadius: '10px', fontSize: '10px', zIndex: 2000, maxWidth: '250px' }}>
          <p>FB_KEY: {(typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_FIREBASE_API_KEY) ? 'OK' : 'MISSING'}</p>
          <p>USER: {user ? user.uid : 'NO AUTH'}</p>
          <button onClick={() => setShowDebug(false)} style={{ color: 'white', marginTop: '10px' }}>閉じる</button>
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
