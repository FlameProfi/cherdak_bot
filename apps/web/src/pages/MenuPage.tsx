import { Link } from 'react-router-dom';
import FeedbackBanner from '../components/ui/FeedbackBanner';
import useMenu from '../hooks/useMenu';

function MenuPage() {
  const { groupedMenu, feedback, isLoading } = useMenu();

  return (
    <>
      <FeedbackBanner feedback={feedback} />
      <header className="page-header">
        <div>
          <Link to="/" className="back-link">
            {'<'} назад
          </Link>
          <h1>Меню Чердака</h1>
          <p>Авторские закуски, комфортные завтраки и напитки для лофт-вечеров.</p>
        </div>
        <Link to="/booking" className="cta-link">
          Забронировать стол
        </Link>
      </header>

      {isLoading ? <div className="loading-panel">Загружаем меню...</div> : null}

      <div className="menu-sections">
        {Object.entries(groupedMenu).map(([category, items]) => (
          <section className="menu-section" key={category}>
            <h2>{category}</h2>
            <div className="menu-grid">
              {items.map((item) => (
                <article className="menu-card" key={item.id}>
                  {item.photo ? (
                    <div className="menu-card-media">
                      <img src={item.photo} alt={item.name} />
                    </div>
                  ) : null}
                  <div className="menu-card-head">
                    <strong>{item.name}</strong>
                    <span>{item.price} ₽</span>
                  </div>
                  <p>{item.description || 'Описание скоро появится.'}</p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

export default MenuPage;
