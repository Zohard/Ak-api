import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/services/prisma.service';
import * as bcrypt from 'bcryptjs';

describe('Users Recommendations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authToken: string;
  let userId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));

    prisma = moduleFixture.get<PrismaService>(PrismaService);

    await app.init();

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ member_name: 'regular_test', password: 'user_password' });

    if (loginResponse.status === 200) {
      authToken = loginResponse.body.access_token;
    } else {
      const hashed = await bcrypt.hash('user_password', 10);
      await prisma.$queryRaw`
        INSERT INTO smf_members (
          member_name,
          real_name,
          email_address,
          passwd,
          id_group,
          date_registered,
          is_activated
        ) VALUES (
          'regular_test',
          'Regular Test User',
          'user@test.com',
          ${hashed},
          0,
          ${Math.floor(Date.now() / 1000)},
          1
        ) ON CONFLICT (member_name) DO NOTHING
      `;

      const retryLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ member_name: 'regular_test', password: 'user_password' });
      authToken = retryLogin.body.access_token;
    }

    const userRecord = await prisma.smfMember.findFirst({
      where: { memberName: 'regular_test' },
      select: { idMember: true },
    });
    userId = userRecord?.idMember || 1;
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return different recommendation pages', async () => {
    const res1 = await request(app.getHttpServer())
      .get(`/users/${userId}/recommendations?limit=1&page=1`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const res2 = await request(app.getHttpServer())
      .get(`/users/${userId}/recommendations?limit=1&page=2`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res1.body).toHaveProperty('items');
    expect(res1.body).toHaveProperty('pagination');
    expect(res1.body.pagination.page).toBe(1);
    expect(res2.body.pagination.page).toBe(2);
    if (res1.body.items.length && res2.body.items.length) {
      expect(res1.body.items[0].id).not.toBe(res2.body.items[0].id);
    }
  });
});
