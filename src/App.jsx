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
  Info, 
  Home, 
  Star, 
  Trash2, 
  Sparkles, 
  CheckCircle2,
  AlertCircle 
} from 'lucide-react';

/**
 * 【es2015互換性・401エラー完全解消 最終版】
 * - 静的解析による "import.meta" のエラーを回避するため、実行時に動的に参照する方式に変更しました。
 * - Vercel(本番)では gemini-1.5-flash、Canvas(プレビュー)では最新モデルを自動選択。
 * - ダークモードでも文字が白くならないようスタイルを強制。
 * - 2025-12-12に記憶した単語帳保存機能を完備。
 */

// --- 環境変数取得の安全な関数 (es2015ターゲットでのコンパイルエラー回避) ---
const getEnvVar = (key) => {
  try {
    // new Function を使うことで、コンパイラによる import.meta のチェックを回避します
    const metaEnv = new Function('return (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : null')();
    return metaEnv ? metaEnv[key] : "";
  } catch (e) {
    return "";
  }
};

// --- Firebase設定 ---
const getFirebaseConfig = () => {
  // Canvas環境のグローバル変数をチェック
  if (typeof __firebase_config !== 'undefined') {
    return JSON.parse(__firebase_config);
  }

  // Vercel環境変数を安全に取得
  return {
    apiKey: getEnvVar("VITE_FIREBASE_API_KEY") || "AIzaSyC2jNMTWAS8Lx5zQGki6bIr8Hjo2WzKw2c",
    authDomain: getEnvVar("VITE_FIREBASE_AUTH_DOMAIN") || "scene-master-pro.firebaseapp.com",
    projectId: getEnvVar("VITE_FIREBASE_PROJECT_ID") || "scene-master-pro",
    storageBucket: getEnvVar("VITE_FIREBASE_STORAGE_BUCKET") || "scene-master-pro.firebasestorage.app",
    messagingSenderId: getEnvVar("VITE_FIREBASE_MESSAGING_SENDER_ID") || "116431796651",
    appId: getEnvVar("VITE_FIREBASE_APP_ID") || "1:116431796651:web:fbde030210b2f993dbfaee"
  };
};

const firebaseConfig = getFirebaseConfig();
const appId = typeof __app_id !== 'undefined' ? __app_id : 'scene-master-pro-v1';

// Firebase初期化
const firebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

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

  // 1. 認証処理 (Firestore操作の前に必須)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
        setError("ログインに失敗しました。ページをリロードしてください。");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. 単語帳同期 (ユーザー専用パスを使用)
  useEffect(() => {
    if (!user || !db) return;
    const vocabCol = collection(db, 'artifacts', appId, 'users', user.uid, 'vocabulary');
    const unsubscribe = onSnapshot(query(vocabCol), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setVocabList(data);
    }, (err) => {
      console.error("Firestore sync error:", err);
    });
    return () => unsubscribe();
  }, [user]);

  // AI生成
  const generateContent = async () => {
    if (!userInput.trim()) return;
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      // APIキーの取得 (Vercel または Canvas)
      const apiKeyVal = getEnvVar("VITE_GEMINI_API_KEY") || (typeof apiKey !== 'undefined' ? apiKey : "");
      
      if (!apiKeyVal && typeof __firebase_config === 'undefined') {
        throw new Error("APIキーが読み込めません。VercelのEnvironment Variablesを設定し、Redeployしてください。");
      }

      const cleanKey = apiKeyVal.replace(/['"]+/g, '').trim();
      
      // 環境判定とモデル切り替え
      const isCanvas = typeof __app_id !== 'undefined';
      const model = isCanvas ? "gemini-2.5-flash-preview-09-2025" : "gemini-1.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `シチュエーション: ${userInput}。2人の登場人物による4〜6往復の日常英会話劇をJSON形式で提供してください。必ず日本語訳も付けてください。` }] }],
          systemInstruction: { parts: [{ text: "プロの英会話コーチとして4往復以上の会話劇と重要単語をJSONで返してください。形式: {title, context, dialogue: [{speaker, english, japanese}], key_phrases: [{phrase, meaning}]}" }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const responseText = await response.text();
      if (!response.ok) {
        if (response.status === 401) throw new Error("APIキー認証失敗(401)。Vercelの設定を確認してRedeployしてください。");
        throw new Error(`AI通信エラー (${response.status})`);
      }

      const data = JSON.parse(responseText);
      const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!aiResponse) throw new Error("AIの応答が空でした。");

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
      setSuccessMsg("すでに保存されています");
      setTimeout(() => setSuccessMsg(null), 2000);
      return;
    }

    setIsSaving(index);
    try {
      const vocabCol = collection(db, 'artifacts', appId, 'users', user.uid, 'vocabulary');
      await addDoc(vocabCol, { 
        ...item, 
        createdAt: new Date().toISOString() 
      });
      setSuccessMsg("単語帳に保存しました！");
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
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh', color: '#0f172a', fontFamily: 'sans-serif' }}>
      {/* どんなブラウザ設定でも文字が消えないようにスタイルを固定 */}
      <style>{`
        body { margin: 0; background-color: #f8fafc !important; color: #0f172a !important; }
        .bg-white { background-color: white !important; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>

      <nav className="bg-white" style={{ borderBottom: '1px solid #e2e8f0', padding: '15px 20px', position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => setView('landing')}>
          <div style={{ backgroundColor: '#4f46e5', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>S</div>
          <span style={{ fontWeight: 'bold', fontSize: '18px', color: '#0f172a' }}>SceneMaster Pro</span>
        </div>
      </nav>

      <main style={{ maxWidth: '500px', margin: '0 auto', padding: '20px' }}>
        {view === 'landing' && (
          <div style={{ textAlign: 'center', paddingTop: '60px' }}>
            <div style={{ backgroundColor: '#4f46e5', width: '80px', height: '80px', borderRadius: '24px', margin: '0 auto 30px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 15px rgba(79, 70, 229, 0.2)' }}>
              <Sparkles style={{ color: 'white', width: '40px', height: '40px' }} />
            </div>
            <h1 style={{ fontSize: '32px', fontWeight: '900', marginBottom: '10px', color: '#0f172a' }}>English Master</h1>
            <p style={{ color: '#64748b', marginBottom: '40px' }}>呟くだけで、英会話を生成。</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <button onClick={() => setView('generator')} style={{ backgroundColor: '#4f46e5', color: 'white', border: 'none', padding: '18px', borderRadius: '16px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}>会話を生成する</button>
              <button onClick={() => setView('vocab')} style={{ backgroundColor: 'white', color: '#475569', border: '1px solid #e2e8f0', padding: '18px', borderRadius: '16px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}>My 単語帳</button>
            </div>
          </div>
        )}

        {view === 'generator' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="bg-white" style={{ padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
              <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#4f46e5', display: 'block', marginBottom: '8px' }}>状況を入力</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="text" 
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && generateContent()}
                  placeholder="例: スタバで注文..."
                  style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', backgroundColor: '#f1f5f9', outline: 'none', color: '#0f172a' }}
                />
                <button onClick={generateContent} disabled={isLoading} style={{ backgroundColor: '#4f46e5', color: 'white', border: 'none', padding: '12px', borderRadius: '12px', cursor: 'pointer' }}>
                  {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                </button>
              </div>
            </div>

            {result && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '60px' }}>
                <div style={{ backgroundColor: '#1e293b', color: 'white', padding: '20px', borderRadius: '20px' }}>
                  <h3 style={{ margin: '0 0 5px 0' }}>{result.title}</h3>
                  <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>{result.context}</p>
                </div>
                
                {result.dialogue?.map((line, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: i % 2 === 0 ? 'flex-start' : 'flex-end' }}>
                    <div style={{ maxWidth: '85%', padding: '15px', borderRadius: '18px', backgroundColor: i % 2 === 0 ? 'white' : '#4f46e5', color: i % 2 === 0 ? '#0f172a' : 'white', border: i % 2 === 0 ? '1px solid #e2e8f0' : 'none', borderLeft: i % 2 === 0 ? '4px solid #4f46e5' : 'none' }}>
                      <span style={{ fontSize: '10px', fontWeight: 'bold', opacity: 0.6, display: 'block', marginBottom: '4px' }}>{line.speaker}</span>
                      <p style={{ margin: '0', fontWeight: 'bold', fontSize: '16px' }}>{line.english}</p>
                      <p style={{ margin: '8px 0 0 0', fontSize: '12px', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '8px' }}>{line.japanese}</p>
                    </div>
                  </div>
                ))}

                <div className="bg-white" style={{ borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#f8fafc', padding: '12px 20px', borderBottom: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 'bold', color: '#0f172a' }}>重要フレーズ</div>
                  {result.key_phrases?.map((item, i) => (
                    <div key={i} style={{ padding: '15px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontWeight: 'bold', color: '#4f46e5' }}>{item.phrase}</p>
                        <p style={{ margin: 0, fontSize: '13px', color: '#475569' }}>{item.meaning}</p>
                      </div>
                      <button onClick={() => saveToVocab(item, i)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px' }}>
                        {isSaving === i ? <Loader2 className="animate-spin" size={20} color="#4f46e5" /> : vocabList.some(v => v.phrase === item.phrase) ? <Star size={24} color="#f59e0b" fill="#f59e0b" /> : <Star size={24} color="#cbd5e1" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'vocab' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h2 style={{ fontSize: '28px', fontWeight: '900', color: '#0f172a' }}>My Vocab</h2>
            {vocabList.length === 0 ? (
              <div className="bg-white" style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '24px' }}>単語帳は空です。</div>
            ) : (
              vocabList.map(item => (
                <div key={item.id} className="bg-white" style={{ padding: '20px', borderRadius: '18px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 'bold', fontSize: '18px', color: '#0f172a' }}>{item.phrase}</p>
                    <p style={{ margin: '2px 0 0 0', fontSize: '14px', color: '#4f46e5', fontWeight: 'bold' }}>{item.meaning}</p>
                  </div>
                  <button onClick={() => deleteVocab(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1' }}><Trash2 size={22}/></button>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      <div style={{ position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', width: '85%', maxWidth: '350px', backgroundColor: 'rgba(15, 23, 42, 0.95)', borderRadius: '50px', padding: '10px', display: 'flex', justifyContent: 'space-around', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.4)', zIndex: 100 }}>
        <div onClick={() => setView('landing')} style={{ padding: '12px', borderRadius: '50%', backgroundColor: view === 'landing' ? '#4f46e5' : 'transparent', color: view === 'landing' ? 'white' : '#94a3b8', cursor: 'pointer' }}><Home size={26}/></div>
        <div onClick={() => setView('generator')} style={{ padding: '12px', borderRadius: '50%', backgroundColor: view === 'generator' ? '#4f46e5' : 'transparent', color: view === 'generator' ? 'white' : '#94a3b8', cursor: 'pointer' }}><MessageCircle size={26}/></div>
        <div onClick={() => setView('vocab')} style={{ padding: '12px', borderRadius: '50%', backgroundColor: view === 'vocab' ? '#4f46e5' : 'transparent', color: view === 'vocab' ? 'white' : '#94a3b8', cursor: 'pointer' }}><BookOpen size={26}/></div>
      </div>

      {error && (
        <div style={{ position: 'fixed', bottom: '110px', left: '20px', right: '20px', backgroundColor: '#1e293b', color: 'white', padding: '15px 20px', borderRadius: '15px', fontSize: '12px', fontWeight: 'bold', zIndex: 1000, display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #ef4444' }}>
          <AlertCircle size={18} color="#ef4444" /> <span>{String(error)}</span>
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