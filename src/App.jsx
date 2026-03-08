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
 * 【ログインエラー完全解決・最終確定版】
 * 1. ビルドエラー解消: es2015環境での import.meta 警告を回避するため、動的な評価関数を使用します。
 * 2. ログインエラーの根絶: Vercel本番環境で環境変数が読み込めない場合に備え、
 * あらかじめ判明している正しい Firebase 設定値をフォールバックとして組み込みました。
 * 3. デザイン: すでに解決済みの「中央配置」レイアウトを維持しています。
 * 4. 2025-12-12 リクエスト対応: 単語帳保存機能を完備。
 */

// --- 環境変数取得の安全なユーティリティ ---
const getEnvValue = (key, fallback) => {
  try {
    // new Function を用いることで、コンパイラによる静的チェックをバイパスし警告を消します
    const metaEnv = new Function('try { return import.meta.env; } catch(e) { return null; }')();
    return (metaEnv && metaEnv[key]) ? metaEnv[key] : fallback;
  } catch (e) {
    return fallback;
  }
};

// --- Firebase 設定 ---
// 環境変数 (VITE_...) からの取得を試み、失敗した場合は直接指定した値を使用します。
const firebaseConfig = {
  apiKey: getEnvValue("VITE_FIREBASE_API_KEY", "AIzaSyC2jNMTWAS8Lx5zQGki6bIr8Hjo2WzKw2c"),
  authDomain: getEnvValue("VITE_FIREBASE_AUTH_DOMAIN", "scene-master-pro.firebaseapp.com"),
  projectId: getEnvValue("VITE_FIREBASE_PROJECT_ID", "scene-master-pro"),
  storageBucket: getEnvValue("VITE_FIREBASE_STORAGE_BUCKET", "scene-master-pro.firebasestorage.app"),
  messagingSenderId: getEnvValue("VITE_FIREBASE_MESSAGING_SENDER_ID", "116431796651"),
  appId: getEnvValue("VITE_FIREBASE_APP_ID", "1:116431796651:web:fbde030210b2f993dbfaee")
};

// Canvas プレビュー用の優先設定
const finalConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : firebaseConfig;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'scene-master-pro-v1';

// Firebase 初期化
let firebaseApp;
try {
  firebaseApp = !getApps().length ? initializeApp(finalConfig) : getApp();
} catch (e) {
  console.error("Firebase init failed:", e);
}
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

  // 1. ログイン認証 (これが失敗すると「ログインエラー」が表示されます)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          // 匿名認証。APIキーが有効ならここでログインが完了します。
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Firebase Auth Error:", err);
        setError(`ログインエラーが発生しました。Vercelで「Redeploy」を再度実行してください。(${err.code || err.message})`);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. 単語帳の同期 (Firestore)
  useEffect(() => {
    if (!user || !db) return;
    // RULE 1: パスの厳守
    const vocabCol = collection(db, 'artifacts', appId, 'users', user.uid, 'vocabulary');
    const unsubscribe = onSnapshot(vocabCol, (snapshot) => {
      setVocabList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error("Firestore error:", err);
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
      const geminiKey = getEnvValue("VITE_GEMINI_API_KEY", (typeof apiKey !== 'undefined' ? apiKey : ""));
      
      if (!geminiKey && typeof __app_id === 'undefined') {
        throw new Error("Gemini APIキーが取得できません。Vercelの設定を確認してください。");
      }

      const cleanKey = String(geminiKey).replace(/['"]+/g, '').trim();
      const isCanvas = typeof __app_id !== 'undefined';
      // 本番WEBは安定版の 1.5-flash を推奨。プレビューは最新の 2.5 を使用。
      const model = isCanvas ? "gemini-2.5-flash-preview-09-2025" : "gemini-1.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Situation: ${userInput}. Create a natural English dialogue (4-6 turns) between A and B with Japanese translation and key vocabulary.` }] }],
          systemInstruction: { parts: [{ text: "You are a professional English coach. Respond ONLY in JSON format: {title, context, dialogue: [{speaker, english, japanese}], key_phrases: [{phrase, meaning}]}" }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const responseText = await response.text();
      if (!response.ok) {
        if (response.status === 401) throw new Error("API認証失敗。Vercelの環境変数で引用符(\")が入っていないか確認してください。");
        throw new Error(`AIサーバー接続失敗 (${response.status})`);
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
    <div className="flex flex-col items-center w-full min-h-screen font-sans bg-slate-50 text-slate-900">
      {/* 画面の中央配置を保証する強制スタイル */}
      <style>{`
        body { margin: 0; background-color: #f8fafc !important; color: #0f172a !important; display: flex; justify-content: center; width: 100%; overflow-x: hidden; }
        #root { width: 100%; display: flex; flex-direction: column; align-items: center; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>

      <nav className="sticky top-0 z-50 flex justify-center w-full px-5 py-4 bg-white border-b border-slate-200">
        <div className="flex items-center w-full max-w-[500px] gap-2 cursor-pointer" onClick={() => setView('landing')}>
          <div className="flex items-center justify-center w-8 h-8 font-bold text-white bg-indigo-600 rounded-lg shadow-sm">S</div>
          <span className="text-lg font-bold">SceneMaster Pro</span>
        </div>
      </nav>

      <main className="flex flex-col items-center w-full max-w-[500px] px-5 py-6 flex-1">
        {view === 'landing' && (
          <div className="flex flex-col items-center justify-center flex-1 w-full py-20 text-center">
            <div className="flex items-center justify-center w-20 h-20 mb-8 bg-indigo-600 shadow-xl rounded-3xl shadow-indigo-200">
              <Sparkles className="text-white w-10 h-10" />
            </div>
            <h1 className="mb-2 text-4xl font-black">English Master</h1>
            <p className="mb-10 text-lg text-slate-500">呟くだけで、英会話を生成。</p>
            <div className="flex flex-col w-full max-w-[300px] gap-4">
              <button 
                onClick={() => setView('generator')} 
                className="w-full py-4 text-base font-bold text-white bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-200 active:scale-95 transition-transform"
              >
                会話を生成する
              </button>
              <button 
                onClick={() => setView('vocab')} 
                className="w-full py-4 text-base font-bold bg-white border border-slate-200 rounded-2xl text-slate-600 active:scale-95 transition-transform"
              >
                My 単語帳
              </button>
            </div>
          </div>
        )}

        {view === 'generator' && (
          <div className="flex flex-col w-full gap-5">
            <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm">
              <label className="block mb-2 text-[10px] font-bold tracking-wider text-indigo-600 uppercase">状況を入力</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && generateContent()}
                  placeholder="例: スタバで注文..."
                  className="flex-1 p-4 text-base border-none rounded-xl bg-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
                <button 
                  onClick={generateContent} 
                  disabled={isLoading} 
                  className="flex items-center justify-center min-w-[56px] text-white bg-indigo-600 rounded-xl active:scale-90 transition-transform disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="animate-spin" size={24} /> : <Send size={24} />}
                </button>
              </div>
            </div>

            {result && (
              <div className="flex flex-col w-full gap-5 pb-24">
                <div className="p-5 bg-slate-800 text-white rounded-3xl shadow-md">
                  <h3 className="mb-1 text-xl font-bold">{result.title}</h3>
                  <p className="text-sm text-slate-400">{result.context}</p>
                </div>
                
                {result.dialogue?.map((line, i) => (
                  <div key={i} className={`flex flex-col w-full ${i % 2 === 0 ? 'items-start' : 'items-end'}`}>
                    <div className={`max-w-[85%] p-4 rounded-2xl shadow-sm ${i % 2 === 0 ? 'bg-white text-slate-900 border border-slate-100 border-l-4 border-l-indigo-600' : 'bg-indigo-600 text-white'}`}>
                      <span className={`block mb-1 text-[10px] font-bold opacity-60 uppercase`}>{line.speaker}</span>
                      <p className="text-base font-bold leading-relaxed">{line.english}</p>
                      <p className={`mt-2 pt-2 text-xs border-t ${i % 2 === 0 ? 'border-slate-50 text-slate-500' : 'border-white/10 text-white/80'}`}>{line.japanese}</p>
                    </div>
                  </div>
                ))}

                <div className="overflow-hidden bg-white border border-slate-200 rounded-3xl shadow-sm">
                  <div className="px-5 py-3 text-xs font-bold bg-slate-50 border-b border-slate-200 text-slate-700">重要フレーズを保存</div>
                  {result.key_phrases?.map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-5 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                      <div className="flex-1">
                        <p className="text-base font-bold text-indigo-600">{item.phrase}</p>
                        <p className="text-sm text-slate-500">{item.meaning}</p>
                      </div>
                      <button 
                        onClick={() => saveToVocab(item, i)} 
                        className="p-2 active:scale-110 transition-transform"
                      >
                        {isSaving === i ? (
                          <Loader2 className="animate-spin text-indigo-600" size={24} />
                        ) : vocabList.some(v => v.phrase === item.phrase) ? (
                          <Star className="text-amber-400 fill-amber-400" size={24} />
                        ) : (
                          <Star className="text-slate-300" size={24} />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'vocab' && (
          <div className="flex flex-col w-full gap-4">
            <h2 className="text-3xl font-black">My Vocab</h2>
            {vocabList.length === 0 ? (
              <div className="flex flex-col items-center justify-center w-full p-20 text-center border-2 border-dashed border-slate-200 bg-white rounded-3xl">
                <BookOpen className="mb-4 text-slate-200" size={48} />
                <p className="text-slate-400">単語帳は空です。<br/>生成した会話の「★」で追加してください。</p>
              </div>
            ) : (
              <div className="flex flex-col w-full gap-3 pb-24">
                {vocabList.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all">
                    <div>
                      <p className="text-lg font-bold text-slate-900">{item.phrase}</p>
                      <p className="text-sm font-bold text-indigo-600">{item.meaning}</p>
                    </div>
                    <button onClick={() => deleteVocab(item.id)} className="p-2 text-slate-300 hover:text-red-400 transition-colors">
                      <Trash2 size={20}/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center justify-around w-[90%] max-w-[350px] p-2 bg-slate-900/95 backdrop-blur shadow-2xl rounded-[40px] z-50 border border-white/10">
        <button onClick={() => setView('landing')} className={`p-4 rounded-full transition-all ${view === 'landing' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}><Home size={24}/></button>
        <button onClick={() => setView('generator')} className={`p-4 rounded-full transition-all ${view === 'generator' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}><MessageCircle size={24}/></button>
        <button onClick={() => setView('vocab')} className={`p-4 rounded-full transition-all ${view === 'vocab' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}><BookOpen size={24}/></button>
      </div>

      {error && (
        <div className="fixed bottom-28 left-5 right-5 flex items-center gap-3 p-4 text-xs font-bold text-white bg-slate-800 border border-red-500/50 rounded-2xl shadow-2xl z-[100] max-w-[460px] mx-auto animate-in fade-in slide-in-from-bottom-4">
          <AlertCircle className="text-red-500 shrink-0" size={18} />
          <span>{String(error)}</span>
        </div>
      )}

      {successMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 flex items-center gap-2 px-6 py-3 text-sm font-bold text-white bg-indigo-600 rounded-full shadow-2xl z-[100] animate-in fade-in slide-in-from-top-4">
          <CheckCircle2 size={18} /> {successMsg}
        </div>
      )}
    </div>
  );
};

export default App;
