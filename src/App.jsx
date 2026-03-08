import React, { useState, useEffect } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
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
  Volume2, 
  BookOpen, 
  Loader2, 
  Info, 
  RefreshCw,
  Home,
  Star,
  Trash2,
  Sparkles, 
  ArrowRight
} from 'lucide-react';

/**
 * ログインエラーの修正とデザイン復旧を兼ねた最終版です。
 */

// --- Firebase & API 設定 ---
const firebaseConfig = {
  apiKey: "AIzaSyC2jNMTWAS8Lx5zQGki6bIr8Hjo2WzKw2c",
  authDomain: "scene-master-pro.firebaseapp.com",
  projectId: "scene-master-pro",
  storageBucket: "scene-master-pro.firebasestorage.app",
  messagingSenderId: "116431796651",
  appId: "1:116431796651:web:fbde030210b2f993dbfaee"
};

const geminiApiKey = "AIzaSyDPSMOMuarm6-aSEwRsLTyJmo0jKVnThxw"; 
const appId = 'scene-master-pro-v1';

// Firebase初期化
let app, auth, db;
try {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase初期化失敗:", e);
}

const App = () => {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing');
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [vocabList, setVocabList] = useState([]);
  const [isPlayingAudio, setIsPlayingAudio] = useState(null);
  const [error, setError] = useState(null);

  // 1. ログイン処理
  useEffect(() => {
    if (!auth) return;
    
    // 匿名ログインの実行
    signInAnonymously(auth)
      .then(() => {
        console.log("ログイン成功");
        setError(null);
      })
      .catch((err) => {
        console.error("ログインエラー詳細:", err);
        // Firebase Consoleで「匿名ログイン」が有効になっていない場合に発生します
        setError("ログインエラー: Firebase Consoleで'匿名ログイン'を有効にしてください。");
      });

    return onAuthStateChanged(auth, setUser);
  }, []);

  // 2. 単語帳の同期
  useEffect(() => {
    if (!user || !db) return;
    const vocabCol = collection(db, 'artifacts', appId, 'users', user.uid, 'vocabulary');
    const q = query(vocabCol);
    
    return onSnapshot(q, (snapshot) => {
      setVocabList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error("データ同期エラー:", err);
      setError("データの読み込みに失敗しました。ルール設定を確認してください。");
    });
  }, [user]);

  // AI生成処理
  const generateContent = async () => {
    if (!userInput.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `シチュエーション: ${userInput}` }] }],
            systemInstruction: { parts: [{ text: "プロの英会話コーチとしてJSON形式で回答してください。{title, context, dialogue: [{speaker, english, japanese}], key_phrases: [{phrase, meaning}]}" }] },
            generationConfig: { responseMimeType: "application/json" }
          })
        }
      );
      
      if (!response.ok) throw new Error('API request failed');
      const data = await response.json();
      setResult(JSON.parse(data.candidates[0].content.parts[0].text));
      setUserInput("");
    } catch (err) {
      console.error(err);
      setError("AI生成に失敗しました。APIキーを確認してください。");
    } finally {
      setIsLoading(false);
    }
  };

  // 音声再生
  const playTTS = async (text, id) => {
    if (!text || isPlayingAudio) return;
    setIsPlayingAudio(id);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: text }] }],
            generationConfig: { 
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } }
            },
            model: "gemini-2.5-flash-preview-tts"
          })
        }
      );
      const data = await response.json();
      const audio = new Audio(`data:audio/wav;base64,${data.candidates[0].content.parts[0].inlineData.data}`);
      audio.onended = () => setIsPlayingAudio(null);
      await audio.play();
    } catch (err) { 
      setIsPlayingAudio(null); 
    }
  };

  const saveToVocab = async (item) => {
    if (!user || !db) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'vocabulary'), { 
        ...item, 
        createdAt: new Date().toISOString() 
      });
    } catch (err) {
      setError("保存に失敗しました。Firestoreのルールを確認してください。");
    }
  };

  const deleteVocab = async (id) => {
    if (!user || !db) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocabulary', id));
  };

  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh', color: '#0f172a', fontFamily: 'sans-serif' }}>
      {/* 画面が真っ暗になるのを防ぐ強制スタイル */}
      <style>{`
        body { margin: 0; background-color: #f8fafc !important; color: #0f172a !important; }
        .bg-white { background-color: white; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <nav className="bg-white shadow-sm" style={{ padding: '15px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => setView('landing')}>
          <div style={{ backgroundColor: '#4f46e5', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>S</div>
          <span style={{ fontWeight: 'bold', fontSize: '18px' }}>SceneMaster Pro</span>
        </div>
      </nav>

      <main style={{ maxWidth: '500px', margin: '0 auto', padding: '20px' }}>
        {view === 'landing' && (
          <div style={{ textAlign: 'center', paddingTop: '60px' }}>
            <div style={{ backgroundColor: '#4f46e5', width: '80px', height: '80px', borderRadius: '24px', margin: '0 auto 30px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 15px -3px rgba(79, 70, 229, 0.4)' }}>
              <Sparkles style={{ color: 'white', width: '40px', height: '40px' }} />
            </div>
            <h1 style={{ fontSize: '32px', fontWeight: '900', marginBottom: '10px' }}>English Master</h1>
            <p style={{ color: '#64748b', marginBottom: '40px', fontSize: '18px' }}>呟くだけで、あなただけの英会話レッスンを生成。</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '300px', margin: '0 auto' }}>
              <button onClick={() => setView('generator')} style={{ backgroundColor: '#4f46e5', color: 'white', border: 'none', padding: '18px', borderRadius: '16px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', transition: '0.2s' }}>学習をはじめる</button>
              <button onClick={() => setView('vocab')} style={{ backgroundColor: 'white', color: '#475569', border: '1px solid #e2e8f0', padding: '18px', borderRadius: '16px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}>My 単語帳</button>
            </div>
          </div>
        )}

        {view === 'generator' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#4f46e5', display: 'block', marginBottom: '8px', letterSpacing: '1px', textTransform: 'uppercase' }}>シチュエーション</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="text" 
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && generateContent()}
                  placeholder="例: スタバで注文..."
                  style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#f1f5f9', outline: 'none', fontSize: '16px' }}
                />
                <button onClick={generateContent} disabled={isLoading} style={{ backgroundColor: '#4f46e5', color: 'white', border: 'none', padding: '14px', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isLoading ? <Loader2 style={{ animation: 'spin 1s linear infinite' }} size={24} /> : <Send size={24} />}
                </button>
              </div>
            </div>

            {result && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '60px' }}>
                <div style={{ backgroundColor: '#1e293b', color: 'white', padding: '20px', borderRadius: '20px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                  <h3 style={{ margin: '0 0 5px 0', fontSize: '20px' }}>{result.title}</h3>
                  <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>{result.context}</p>
                </div>
                {result.dialogue.map((line, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: i % 2 === 0 ? 'flex-start' : 'flex-end' }}>
                    <div style={{ maxWidth: '85%', padding: '15px', borderRadius: '18px', backgroundColor: i % 2 === 0 ? 'white' : '#4f46e5', color: i % 2 === 0 ? '#1e293b' : 'white', borderLeft: i % 2 === 0 ? '4px solid #4f46e5' : 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', fontWeight: 'bold', opacity: 0.6, textTransform: 'uppercase' }}>{line.speaker}</span>
                        <Volume2 size={16} onClick={() => playTTS(line.english, `d-${i}`)} style={{ cursor: 'pointer', opacity: 0.5 }} />
                      </div>
                      <p style={{ margin: '0', fontWeight: 'bold', fontSize: '18px', lineHeight: 1.3 }}>{line.english}</p>
                      <p style={{ margin: '10px 0 0 0', fontSize: '13px', opacity: 0.7, borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '10px' }}>{line.japanese}</p>
                    </div>
                  </div>
                ))}

                <div className="bg-white" style={{ borderRadius: '20px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#f8fafc', padding: '12px 20px', borderBottom: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Star size={14} style={{ color: '#f59e0b', fill: '#f59e0b' }} /> 重要フレーズを保存
                  </div>
                  {result.key_phrases.map((item, i) => (
                    <div key={i} style={{ padding: '15px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontWeight: 'bold', color: '#4f46e5', fontSize: '16px' }}>{item.phrase}</p>
                        <p style={{ margin: 0, fontSize: '14px', color: '#475569' }}>{item.meaning}</p>
                      </div>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <button onClick={() => playTTS(item.phrase, `p-${i}`)} style={{ background: 'none', border: 'none', padding: '10px', color: '#cbd5e1', cursor: 'pointer' }}><Volume2 size={20}/></button>
                        <button onClick={() => saveToVocab(item)} style={{ background: 'none', border: 'none', padding: '10px', color: '#cbd5e1', cursor: 'pointer' }}><Star size={20}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'vocab' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h2 style={{ fontSize: '28px', fontWeight: '900' }}>My Vocab</h2>
            {vocabList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '24px', backgroundColor: 'white' }}>
                単語帳は空です。<br/>英会話を生成して「★」ボタンを押すとここに保存されます。
              </div>
            ) : (
              vocabList.map(item => (
                <div key={item.id} style={{ backgroundColor: 'white', padding: '20px', borderRadius: '18px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: 'bold', fontSize: '18px' }}>{item.phrase}</p>
                    <p style={{ margin: '2px 0 0 0', fontSize: '14px', color: '#4f46e5', fontWeight: 'bold' }}>{item.meaning}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Volume2 size={22} onClick={() => playTTS(item.phrase, item.id)} style={{ color: '#cbd5e1', cursor: 'pointer' }} />
                    <Trash2 size={22} onClick={() => deleteVocab(item.id)} style={{ color: '#cbd5e1', cursor: 'pointer' }} />
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* ボトムナビ */}
      <div style={{ position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', width: '85%', maxWidth: '350px', backgroundColor: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(10px)', borderRadius: '50px', padding: '10px', display: 'flex', justifyContent: 'space-around', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.4)', zIndex: 100, border: '1px solid rgba(255,255,255,0.1)' }}>
        <div onClick={() => setView('landing')} style={{ padding: '12px', borderRadius: '50%', backgroundColor: view === 'landing' ? '#4f46e5' : 'transparent', color: view === 'landing' ? 'white' : '#94a3b8', cursor: 'pointer', transition: '0.2s' }}><Home size={26}/></div>
        <div onClick={() => setView('generator')} style={{ padding: '12px', borderRadius: '50%', backgroundColor: view === 'generator' ? '#4f46e5' : 'transparent', color: view === 'generator' ? 'white' : '#94a3b8', cursor: 'pointer', transition: '0.2s' }}><MessageCircle size={26}/></div>
        <div onClick={() => setView('vocab')} style={{ padding: '12px', borderRadius: '50%', backgroundColor: view === 'vocab' ? '#4f46e5' : 'transparent', color: view === 'vocab' ? 'white' : '#94a3b8', cursor: 'pointer', transition: '0.2s' }}><BookOpen size={26}/></div>
      </div>

      {error && (
        <div style={{ position: 'fixed', bottom: '110px', left: '20px', right: '20px', backgroundColor: '#1e293b', color: 'white', padding: '15px 20px', borderRadius: '15px', fontSize: '12px', fontWeight: 'bold', zIndex: 1000, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Info size={18} style={{ color: '#ef4444' }} /> {error}
        </div>
      )}
    </div>
  );
};

export default App;