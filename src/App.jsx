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
  Sparkles 
} from 'lucide-react';

/**
 * 【音無し・安定重視版】
 * - 音声再生機能を完全に削除し、通信の成功率を最大化。
 * - 4〜6往復の会話ラリー生成と単語保存に特化。
 * - 2025-12-12にリクエストされた「私が覚えるべき単語リスト」を確実に保存します。
 */

// --- 環境設定 ---
const apiKey = ""; // Canvasプレビュー環境では自動注入のため空文字

const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "AIzaSyC2jNMTWAS8Lx5zQGki6bIr8Hjo2WzKw2c",
      authDomain: "scene-master-pro.firebaseapp.com",
      projectId: "scene-master-pro",
      storageBucket: "scene-master-pro.firebasestorage.app",
      messagingSenderId: "116431796651",
      appId: "1:116431796651:web:fbde030210b2f993dbfaee"
    };

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
  const [result, setResult] = useState(null);
  const [vocabList, setVocabList] = useState([]);
  const [error, setError] = useState(null);

  // 1. 認証処理
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        setError("ログインエラーが発生しました。");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. 単語帳の同期
  useEffect(() => {
    if (!user || !db) return;
    const vocabCol = collection(db, 'artifacts', appId, 'users', user.uid, 'vocabulary');
    const unsubscribe = onSnapshot(query(vocabCol), (snapshot) => {
      setVocabList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error(err);
    });
    return () => unsubscribe();
  }, [user]);

  // AI生成（ラリー形式）
  const generateContent = async () => {
    if (!userInput.trim()) return;
    setIsLoading(true);
    setError(null);
    setResult(null);

    const prompt = `シチュエーション: ${userInput}。
人物Aと人物Bによる、自然な日常英会話のラリー（4〜6往復分）と、そのシーンで使われた重要な英単語/表現を作成してください。
必ず以下のJSON形式でのみ答えてください。説明文などは一切不要です。

形式:
{
  "title": "シーン名",
  "context": "状況説明",
  "dialogue": [
    {"speaker": "A", "english": "...", "japanese": "..."},
    {"speaker": "B", "english": "...", "japanese": "..."}
  ],
  "key_phrases": [
    {"phrase": "単語/表現", "meaning": "意味"}
  ]
}`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: "英会話コーチとして、4往復以上のラリー形式で会話を生成してください。必ずJSON形式で返答してください。" }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(`通信失敗 (${response.status})`);
      }

      const data = JSON.parse(text);
      const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!aiResponse) throw new Error("AIの返答が空でした。");

      const parsed = JSON.parse(aiResponse.replace(/```json/g, "").replace(/```/g, "").trim());
      setResult(parsed);
      setUserInput("");
    } catch (err) {
      setError(`AI生成エラー: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const saveToVocab = async (item) => {
    if (!user || !db) return;
    try {
      const vocabCol = collection(db, 'artifacts', appId, 'users', user.uid, 'vocabulary');
      await addDoc(vocabCol, { ...item, createdAt: new Date().toISOString() });
    } catch (err) {
      setError("単語の保存に失敗しました。");
    }
  };

  const deleteVocab = async (id) => {
    if (!user || !db) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocabulary', id));
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-24 text-slate-900 leading-relaxed overflow-x-hidden">
      <style>{`
        body { margin: 0; background-color: #f8fafc !important; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>

      {/* ヘッダー */}
      <nav className="bg-white border-b px-6 py-4 sticky top-0 z-50 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('landing')}>
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-md">S</div>
          <span className="font-bold text-lg tracking-tight text-slate-900">SceneMaster Pro</span>
        </div>
      </nav>

      <main className="max-w-xl mx-auto p-5">
        {view === 'landing' && (
          <div className="py-20 text-center">
            <div className="w-20 h-20 bg-indigo-600 rounded-3xl mx-auto flex items-center justify-center shadow-xl mb-8">
              <Sparkles className="text-white w-10 h-10" />
            </div>
            <h1 className="text-4xl font-black mb-4 tracking-tight text-slate-900">English Master</h1>
            <p className="text-slate-500 mb-10 text-lg">状況を入れるだけで、英会話を生成。</p>
            <div className="flex flex-col gap-4 max-w-xs mx-auto">
              <button onClick={() => setView('generator')} className="bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 transition-all">英会話を生成する</button>
              <button onClick={() => setView('vocab')} className="bg-white text-slate-600 font-bold py-4 rounded-2xl border border-slate-200">My 単語帳</button>
            </div>
          </div>
        )}

        {view === 'generator' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 border shadow-sm">
              <label className="text-xs font-bold text-indigo-600 uppercase mb-2 block tracking-widest">状況を入力</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && generateContent()}
                  placeholder="例: スタバでカスタム注文..."
                  className="flex-1 bg-slate-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-600 transition-all"
                />
                <button onClick={generateContent} disabled={isLoading} className="bg-indigo-600 text-white p-3 rounded-xl shadow-md disabled:bg-slate-300">
                  {isLoading ? <Loader2 className="animate-spin w-6 h-6" /> : <Send className="w-6 h-6" />}
                </button>
              </div>
            </div>

            {result && (
              <div className="space-y-6 pb-10">
                <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl">
                  <h3 className="text-xl font-bold mb-1">{result.title}</h3>
                  <p className="text-slate-400 text-sm">{result.context}</p>
                </div>
                
                {result.dialogue?.map((line, i) => (
                  <div key={i} className={`flex flex-col ${i % 2 === 0 ? 'items-start' : 'items-end'}`}>
                    <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm ${i % 2 === 0 ? 'bg-white border-l-4 border-indigo-600 text-slate-900' : 'bg-indigo-600 text-white'}`}>
                      <span className="text-[10px] font-bold opacity-50 uppercase block mb-1">{line.speaker}</span>
                      <p className="text-lg font-bold leading-tight">{line.english}</p>
                      <p className={`text-xs mt-2 border-t pt-2 ${i % 2 === 0 ? 'text-slate-400 border-slate-100' : 'text-indigo-100 border-indigo-500/30'}`}>{line.japanese}</p>
                    </div>
                  </div>
                ))}

                <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                  <div className="bg-slate-50 px-6 py-3 border-b font-bold text-sm flex items-center gap-2">
                    <Star size={14} className="text-amber-500 fill-amber-500" /> 重要フレーズ
                  </div>
                  <div className="divide-y divide-slate-100">
                    {result.key_phrases?.map((item, i) => (
                      <div key={i} className="p-4 flex justify-between items-center hover:bg-slate-50">
                        <div className="flex-1">
                          <p className="font-bold text-indigo-600 text-lg">{item.phrase}</p>
                          <p className="text-sm text-slate-700">{item.meaning}</p>
                        </div>
                        <button onClick={() => saveToVocab(item)} className="p-2 text-slate-300 hover:text-amber-500 transition-colors ml-4"><Star className="w-5 h-5"/></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'vocab' && (
          <div className="space-y-4">
            <h2 className="text-3xl font-black text-slate-800 tracking-tight">My Vocab</h2>
            {vocabList.length === 0 ? (
              <div className="text-center py-32 text-slate-300 border-2 border-dashed rounded-[2rem] bg-white shadow-sm">
                単語帳は空です。生成した会話の「★」で保存しましょう。
              </div>
            ) : (
              <div className="grid gap-3">
                {vocabList.map(item => (
                  <div key={item.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center">
                    <div className="flex-1">
                      <p className="font-bold text-lg text-slate-900">{item.phrase}</p>
                      <p className="text-indigo-600 font-bold text-sm">{item.meaning}</p>
                    </div>
                    <button onClick={() => deleteVocab(item.id)} className="p-2 text-slate-200 hover:text-red-500 ml-4"><Trash2 className="w-6 h-6"/></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-sm bg-slate-900/95 backdrop-blur-sm text-white rounded-full p-2 flex justify-around shadow-2xl z-50 border border-white/10">
        <button onClick={() => setView('landing')} className={`p-4 rounded-full transition-all ${view === 'landing' ? 'bg-indigo-600 shadow-lg' : 'text-slate-500'}`}><Home className="w-6 h-6"/></button>
        <button onClick={() => setView('generator')} className={`p-4 rounded-full transition-all ${view === 'generator' ? 'bg-indigo-600 shadow-lg' : 'text-slate-500'}`}><MessageCircle className="w-6 h-6"/></button>
        <button onClick={() => setView('vocab')} className={`p-4 rounded-full transition-all ${view === 'vocab' ? 'bg-indigo-600 shadow-lg' : 'text-slate-500'}`}><BookOpen className="w-6 h-6"/></button>
      </div>

      {error && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl z-[100] text-xs font-bold flex items-center gap-3 border border-red-500/30">
          <Info className="w-4 h-4 text-red-500" /> 
          <span className="max-w-[250px] truncate text-slate-100">{String(error)}</span>
        </div>
      )}
    </div>
  );
};

export default App;