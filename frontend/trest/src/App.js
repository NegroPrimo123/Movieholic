import logo from './logo.svg';
import './App.css';
import './Notification.css';
import { useState } from 'react';


function App() {
  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.js</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>

        <MyButton />
        <NotificationSystem />

      </header>
    </div>
  );
}



function MyButton() {
  const [showButton, setShowButton] = useState(false);

  function handleClick() {
    setShowButton(true);
    setTimeout(() => setShowButton(false), 5 * 1000);
  }

  return (
    <div>
      <button 
        onClick={handleClick}
    
        className="triggerButton"
      >
      </button>

      {showButton && (
        <a 
          href="https://reactjs.org" 
          className="notificationBtn"

        >
          asdasd
        </a>
      )}
    </div>
  );
}


function NotificationSystem() {
  const [notifications, setNotifications] = useState([]);
  const [inputText, setInputText] = useState('');

  const addNotification = () => {
    if (!inputText.trim()) return;
    
    const id = Date.now();
    const newNotification = {
      id,
      message: inputText,
      top: 20 + notifications.length * 60
    };
    
    setNotifications([...notifications, newNotification]);
    setInputText(''); 
    
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  };

  const removeNotification = (id) => {
    setNotifications(notifications.filter(n => n.id !== id));
  };

  return (
    <div className="triggerButton">
      
      <div className="input-box">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Введите сообщение..."
          className="message-input"
          onKeyDown={(e) => e.key === 'Enter' && addNotification()}
        />
        <button 
          onClick={addNotification}
          className="add-btn"
        >
          Добавить
        </button>
      </div>
      
      {notifications.map((notification) => (
        <a 
          key={notification.id}
          href="https://reactjs.org" 
          className="notification-btn"
          style={{ top: `${notification.top}px` }}
        >
          {notification.message}
        </a>
      ))}

    </div>
  );
}

export default App;
