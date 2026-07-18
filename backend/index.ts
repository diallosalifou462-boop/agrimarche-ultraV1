
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());

app.get('/health', (_, res) => {
  res.json({ status: 'ok', service: 'agrimarche-api' });
});

app.listen(3001, () => {
  console.log('Agrimarche backend running on port 3001');
});
