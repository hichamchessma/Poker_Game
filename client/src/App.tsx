import React from 'react';
import './App.css';

function App() {
  const suits = ['c', 'd', 'h', 's'];
  const ranks = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k'];

  return (
    <div className="App">
      <h1>Poker Cards</h1>
      <div className="card-grid">
        {ranks.map((rank) =>
          suits.map((suit) => (
            <img
              key={`${rank}${suit}`}
              src={`/cards/card_${rank}${suit}.png`}
              alt={`${rank}${suit}`}
              className="card"
            />
          ))
        )}
      </div>
    </div>
  );
}

export default App;
