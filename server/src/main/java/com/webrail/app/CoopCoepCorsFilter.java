
package com.webrail.app;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
@Order(0)
public class CoopCoepCorsFilter implements Filter {
    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        if (response instanceof HttpServletResponse resp) {
            resp.setHeader("Cross-Origin-Opener-Policy", "same-origin");
            resp.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
            resp.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
            resp.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
            resp.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
            resp.setHeader("Access-Control-Allow-Credentials", "true");
        }
        chain.doFilter(request, response);
    }
}
