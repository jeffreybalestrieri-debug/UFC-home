library(tidyverse)

k <- 1.718644

markets <- read.csv('~/Downloads/all_market_match_exports_2026-05-01T18-25-55-04-00.csv') %>% 
  filter(Stat.name == "Significant Strikes",
         Line.status == 'active',
         # Player.Name == 'John Castaneda',
         # Line.value == 55.5,
         Line.type == 'balanced') %>% 
  select(Player.Name, Appearance.Id, Stat.name, Line.value)

get_mu_adjusted <- function(line, k) {
  find_mean <- function(mu) {
    beta <- mu / k
    qgamma(0.5, shape = k, scale = beta) - line
  }
  uniroot(find_mean, lower = line * 0.5, upper = line * 2)$root
}

generate_alts <- function(row, k) {
  line <- row$Line.value
  mu_adjusted <- get_mu_adjusted(line, k)
  beta <- mu_adjusted / k
  
  # alt thresholds: 9.5, 19.5, 29.5, ...
  thresholds <- seq(9.5, line + 60, by = 10)
  
  # remove any threshold within 8 of the main line
  thresholds <- thresholds[abs(thresholds - line) > 8]
  
  probs_over <- 1 - pgamma(thresholds, shape = k, scale = beta)
  
  alts <- data.frame(
    player_name      = row$Player.Name,
    appearance_id    = row$Appearance.Id,
    stat_name        = "significant_strikes",
    is_alt           = TRUE,
    line_replacement = "",
    stat_value       = thresholds,
    over_decimal_odds     = round(1 / probs_over, 2),
    under_decimal_odds    = ""
  )
  
  # main line row
  main <- data.frame(
    player_name      = row$Player.Name,
    appearance_id    = row$Appearance.Id,
    stat_name        = "significant_strikes",
    is_alt           = "",
    line_replacement = TRUE,
    stat_value       = line,
    over_decimal_odds     = 2,
    under_decimal_odds    = 2
  )
  
  rbind(main, alts)
}

results <- do.call(rbind, lapply(1:nrow(markets), function(i) {
  generate_alts(markets[i, ], k)
}))

print(results)

write.csv(results, '~/Desktop/ss_alt_upload.csv', row.names = F)
