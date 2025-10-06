package com.yourco.queso

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.UrlBasedCorsConfigurationSource
import org.springframework.web.filter.CorsFilter
import java.nio.file.Files
import java.nio.file.Path

@RestController
@RequestMapping("/api/tracks")
class ArrangementController {
    private val root = Path.of("data/output")

    @GetMapping("/{id}/arrangement", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getArrangement(@PathVariable id: String): String {
        val p = root.resolve("$id.arrangement.json")
        if (!Files.exists(p)) throw RuntimeException("Not found: $p")
        return Files.readString(p)
    }

    // Optional: proxy audio when you want to keep everything under the API host
    @GetMapping("/{id}/audio", produces = [MediaType.APPLICATION_OCTET_STREAM_VALUE])
    fun getAudio(@PathVariable id: String): ByteArray {
        val p = Path.of("src/main/resources/static/media/$id.mp3")
        if (!Files.exists(p)) throw RuntimeException("Audio not found: $p")
        return Files.readAllBytes(p)
    }
}

@Configuration
class WebConfig {
    @Bean
    fun corsFilter(): CorsFilter {
        val config = CorsConfiguration().apply {
            allowCredentials = true
            addAllowedOriginPattern("*")
            addAllowedHeader("*")
            addAllowedMethod("*")
        }
        val source = UrlBasedCorsConfigurationSource()
        source.registerCorsConfiguration("/**", config)
        return CorsFilter(source)
    }
}
