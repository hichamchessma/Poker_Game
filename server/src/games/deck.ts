export interface Card {
    suit: string;
    rank: string;
    value: number;
}

export class Deck {
    private cards: Card[];
    private readonly suits = ['♠', '♣', '♥', '♦'];
    private readonly ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    private readonly values = {
        '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
        'J': 11, 'Q': 12, 'K': 13, 'A': 14
    };

    constructor() {
        this.cards = this.initializeDeck();
        this.shuffle();
    }

    private initializeDeck(): Card[] {
        const deck: Card[] = [];
        for (const suit of this.suits) {
            for (const rank of this.ranks) {
                deck.push({
                    suit,
                    rank,
                    value: this.values[rank]
                });
            }
        }
        return deck;
    }

    public shuffle(): void {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    public dealCards(numCards: number): Card[] {
        if (numCards > this.cards.length) {
            throw new Error('Not enough cards in the deck');
        }
        return this.cards.splice(0, numCards);
    }

    public drawCard(): string {
        if (this.cards.length === 0) {
            throw new Error('No cards left in the deck');
        }
        const card = this.cards.pop()!;
        return `${card.rank}${card.suit}`;
    }

    public getRemainingCards(): number {
        return this.cards.length;
    }

    public reset(): void {
        this.cards = this.initializeDeck();
        this.shuffle();
    }
}
