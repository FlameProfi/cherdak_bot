import { Link } from 'react-router-dom';
import { REVIEW_URL } from '../shared/constants';

function HomePage() {
  return (
    <>
      <header className="hero">
        <span className="pill">Лофт Чердак</span>
        <h1>Чердак — стильный лофт, уютные вечера и живая атмосфера.</h1>
        <p>
          Погрузитесь в черно-белый интерьер, выберите меню и забронируйте место прямо
          на сайте.
        </p>
      </header>

      <section className="home-grid">
        <article className="feature-card">
          <h2>Меню</h2>
          <p>Полная карта блюд и авторские позиции ждут вас на отдельной странице.</p>
          <Link to="/menu" className="cta-link">
            Перейти в меню
          </Link>
        </article>

        <article className="feature-card">
          <h2>Бронирование</h2>
          <p>Выберите стол на схеме зала и отправьте бронь в пару кликов.</p>
          <Link to="/booking" className="cta-link">
            Перейти к брони
          </Link>
        </article>
      </section>

      <section className="review-card">
        <h2>Отзывы</h2>
        <p>Оставьте своё мнение о визите на Яндекс Картах.</p>
        <a href={REVIEW_URL} className="cta-link">
          Оставить отзыв
        </a>
      </section>
    </>
  );
}

export default HomePage;
