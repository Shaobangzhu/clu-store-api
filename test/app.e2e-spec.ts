import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

type GraphQLHelloResponse = {
  data: {
    hello: string;
  };
};

describe('GraphQL App (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/graphql returns hello query result', async () => {
    const query = {
      query: `
        query {
          hello
        }
      `,
    };

    const server = app.getHttpServer() as Parameters<typeof request>[0];

    const response = await request(server)
      .post('/graphql')
      .send(query)
      .expect(200);

    const body = response.body as GraphQLHelloResponse;

    expect(body.data.hello).toBe('GraphQL is ready');
  });

  afterEach(async () => {
    await app.close();
  });
});
