// Saved meals and foods on one page (Fold 8 design): side by side unfolded, a switch folded.
import { useState } from 'react';
import MealsScreen from './MealsScreen';
import FoodsScreen from './FoodsScreen';

export default function MealsFoodsScreen({ initial = 'meals' }: { initial?: 'meals' | 'foods' }) {
  const [tab, setTab] = useState(initial);
  return (
    <main className="fd-page">
      <div className="fd-chips fd-narrow">
        <button type="button" className={`fd-chip${tab === 'meals' ? ' on' : ''}`} onClick={() => setTab('meals')}>Meals</button>
        <button type="button" className={`fd-chip${tab === 'foods' ? ' on' : ''}`} onClick={() => setTab('foods')}>Foods</button>
      </div>
      <div className="fd-two">
        <div className={tab === 'meals' ? '' : 'fd-only-wide'}><MealsScreen /></div>
        <div className={tab === 'foods' ? '' : 'fd-only-wide'}><FoodsScreen /></div>
      </div>
    </main>
  );
}
