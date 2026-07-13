import oauthPlugin, { OAuth2Namespace } from "@fastify/oauth2";
import { FastifyInstance } from "fastify";

const SSO_CLIENT_ID = process.env.SSO_CLIENT_ID;
const SSO_CLIENT_SECRET = process.env.SSO_CLIENT_SECRET;
const SSO_ISSUER_HOST = process.env.SSO_ISSUER_HOST;
const SSO_CALLBACK_URL = process.env.SSO_CALLBACK_URL;
const SSO_SCOPE = (process.env.SSO_SCOPE || "profile email").split(",");

type UserInfo = {
    sub: string;
    email: string;
    email_verified: boolean;
    family_name: string;
    given_name: string;
    name: string;
    preferred_username: string;
};

declare module "fastify" {
    interface FastifyInstance {
        googleSSO: OAuth2Namespace;
    }
}

async function routes(fastify: FastifyInstance) {
    fastify.register(oauthPlugin as any, {
        name: "googleSSO",
        scope: SSO_SCOPE,
        credentials: {
            client: {
                id: SSO_CLIENT_ID,
                secret: SSO_CLIENT_SECRET,
            },
        },
        callbackUri: SSO_CALLBACK_URL,
        discovery: {
            issuer: SSO_ISSUER_HOST,
        },
        callbackUriParams: {
            access_type: 'offline',
          },

    });

    fastify.get("/login", (request, reply) => {
        fastify.googleSSO.generateAuthorizationUri(
            request,
            reply,
            (err, authorizationEndpoint) => {
                if (err) {
                    console.error(err);
                    return reply.send(500);
                }

                reply.redirect(authorizationEndpoint);
            }
        );
    });


    fastify.get("/auth/refresh", async (request, reply) => {
        const token = (request as any).session.token;

        try {

            const newAccessToken =
                await fastify.googleSSO.getNewAccessTokenUsingRefreshToken(token, {});

            (request as any).session.token = newAccessToken.token;

            return reply.send(newAccessToken);
        } catch (error: unknown) {
            console.error(error);
            return reply.send({ message: "Some error occured!" });
        }
    });

    fastify.get("/auth/callback/oidc", async function (request, reply) {
        try {
            const tokenSet =
                await fastify.googleSSO.getAccessTokenFromAuthorizationCodeFlow(
                    request,
                    reply
                );

            const userInfo = (await fastify.googleSSO.userinfo(
                tokenSet.token.access_token
            )) as unknown as UserInfo;

            let defaultRedirect = "/";
            try {
                const { redirectUri = "/" } = (request as any).session;
                defaultRedirect = redirectUri;
            } catch (error) {
                console.error(error);
            }

            (request as any).session.user = userInfo;
            (request as any).session.token = tokenSet.token;

            return reply.redirect(defaultRedirect);
        } catch (error) {
            console.error(error);
            return reply.send({ message: "Some error occured!" });
        }
    });
}

export { routes as googleAuthPlugin };
